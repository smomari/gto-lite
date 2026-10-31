import type { HandFrequency } from "@/types/rangeData";
import type { PostflopSolvePhase } from "@/types/postflopSolver";
import type { BoardCards, ComboRange } from "./types";
import { expandToCombos, filterBlockedCombos } from "./combos";
import { buildEquityTable, type EquityTable } from "./terminalEquity";
import { LOOKAHEAD_BET_SIZING, streetForBoardLength, type PostflopStreet } from "./betAbstraction";
import { stratifiedNextCards } from "./nextCardSampling";
import { buildHandTree, buildStreetTree, type HandTreeOptions, type PostflopTreeNode } from "./treeBuilder";
import type { CfrSolution } from "./cfr";
import type { ExploitabilityResult } from "./exploitability";
import { runNativeCfr, solveNativeSession, solveThreadedSession, type NativeSolveSession } from "./wasm/engine";
import { RunoutEquity } from "./wasm/runoutEquity";
import type { SolverModule } from "./wasm/solverModule";

interface PostflopSolveInputCommon {
  board: BoardCards;
  /** Pot size entering the street. */
  startPot: number;
  /** Effective stack behind, shared by both players (mirrors the preflop tool's uniform-stack model). */
  effectiveStackBb: number;
  /** Hard safety cap on CFR iterations — passed straight through to runCfr, no default injected here. */
  maxIterations: number;
  /** Stop CFR early once measured exploitability is at or below this (% of pot). Omit to disable early stopping. */
  targetExploitabilityPercent?: number;
  /** Flop only: stop the lookahead at the turn (FLOP_FAST_LOOKAHEAD), for a quicker, less accurate solve. */
  fast?: boolean;
}

export type PostflopSolveInput =
  | (PostflopSolveInputCommon & {
      kind: "canonical";
      heroHandFrequencies: HandFrequency[];
      /** Which of hero's fold/call/raise/allin frequencies defines their range entering this street. */
      heroActionWeight: (hf: HandFrequency) => number;
      villainHandFrequencies: HandFrequency[];
      villainActionWeight: (hf: HandFrequency) => number;
    })
  | (PostflopSolveInputCommon & {
      kind: "combos";
      /** Already-computed combo-level ranges (e.g. reach-weighted forward from a prior street), board-blocking not yet applied. */
      heroRange: ComboRange;
      villainRange: ComboRange;
    });

/**
 * River cards a turn solve looks ahead into — see stratifiedNextCards. On a
 * 251×359-combo turn, 12 cards came within 1.2 points of check frequency and
 * 0.7% of EV of all 48 (8 cards: 4 points over on checking, 3% under on EV).
 */
export const LOOKAHEAD_RIVER_CARDS = 12;

/**
 * Turn cards a flop solve looks ahead into, and river cards under each.
 * `npm run accuracy:postflop` prices each lookahead's flop strategy against a
 * tree with every turn and river, as the pot share both players lose together
 * (3-bet pots / SRPs, narrowed ranges): this 3.4% / 2.7%, stopping at the turn
 * with 10 cards 4.3% / 5.2%, with 16 cards 4.4% / 4.3%, with every turn
 * 2.7% / 3.8%. Rivers are what deep stacks need; more turn cards barely help,
 * though no sample wins on every board. A BTN-vs-BB flop takes 2.4s in the browser.
 */
export const FLOP_LOOKAHEAD = { turnCards: 10, riverCards: 6 };

/** The opt-in quicker flop lookahead: it stops at the turn, then checks down. The same flop takes 0.7s. */
export const FLOP_FAST_LOOKAHEAD = { turnCards: 10, riverCards: 0 };

/**
 * How a street's solve looks past its own end, or null when
 * it doesn't (the river). Later streets get a stratified sample of their cards
 * and the reduced LOOKAHEAD_BET_SIZING menu; each is re-solved with its full
 * menu once its card is picked.
 */
export function lookaheadOptions(street: PostflopStreet, fast = false): HandTreeOptions | null {
  if (street === "turn") {
    return { dealNextCards: (board) => stratifiedNextCards(board, LOOKAHEAD_RIVER_CARDS), laterStreetSizing: LOOKAHEAD_BET_SIZING };
  }
  if (street === "flop") {
    const { turnCards, riverCards } = fast ? FLOP_FAST_LOOKAHEAD : FLOP_LOOKAHEAD;
    return {
      dealNextCards: (board) => stratifiedNextCards(board, board.length === 3 ? turnCards : riverCards),
      laterStreetSizing: LOOKAHEAD_BET_SIZING,
      lastStreet: riverCards > 0 ? "river" : "turn",
    };
  }
  return null;
}

/** The loaded C++ solver core a solve runs on. */
export interface PostflopEngine {
  solver: SolverModule;
  /** Threads a lookahead solve runs on (a threaded build of the module, with that many in its pool) — see solveThreadedSession. */
  threads?: number;
}

export interface PostflopSolveResult {
  tree: PostflopTreeNode;
  heroRange: ComboRange;
  villainRange: ComboRange;
  solution: CfrSolution;
  exploitability: ExploitabilityResult;
  /** The board-fixed equity table this solve was run against — reused by checkdownEquity.ts to report per-node showdown averages without recomputing anything. */
  equityTable: EquityTable;
  /**
   * Set when the solve looked ahead past its street (a flop or turn solve):
   * the engine is kept alive so the caller can read values
   * below the street's end (session.nextStreetEv) before disposing it, which it must.
   */
  session?: NativeSolveSession;
}

/**
 * Top-level Phase 1 orchestrator for one street: `kind: "canonical"` expands
 * preflop-shaped `HandFrequency[]` into combos (the flop's own starting
 * range); `kind: "combos"` takes an already-computed combo-level range
 * carried forward from a prior street (e.g. the turn's reach-weighted range,
 * see rangeNarrowing.ts) and just re-applies board-blocking for the new card.
 * Either way, a solved street tree comes out.
 */
export function solvePostflopStreet(
  input: PostflopSolveInput,
  engine: PostflopEngine,
  onProgress?: (phase: PostflopSolvePhase, done: number, total: number, exploitabilityPercent?: number) => void,
): PostflopSolveResult {
  const heroRange =
    input.kind === "canonical"
      ? expandToCombos(input.heroHandFrequencies, input.heroActionWeight, input.board)
      : filterBlockedCombos(input.heroRange, input.board);
  const villainRange =
    input.kind === "canonical"
      ? expandToCombos(input.villainHandFrequencies, input.villainActionWeight, input.board)
      : filterBlockedCombos(input.villainRange, input.board);

  if (heroRange.length === 0 || villainRange.length === 0) {
    throw new Error("solvePostflopStreet: hero and villain ranges must both be non-empty after board removal");
  }

  // A flop's tables come from its runout strengths in one pass (RunoutEquity)
  // — the flop's own table and every lookahead turn's.
  const runout = input.board.length === 3 ? RunoutEquity.create(engine.solver, heroRange, villainRange, input.board) : null;
  try {
    return solveWithTables(input, heroRange, villainRange, engine, runout, onProgress);
  } finally {
    runout?.dispose();
  }
}

function solveWithTables(
  input: PostflopSolveInput,
  heroRange: ComboRange,
  villainRange: ComboRange,
  engine: PostflopEngine,
  runout: RunoutEquity | null,
  onProgress?: (phase: PostflopSolvePhase, done: number, total: number, exploitabilityPercent?: number) => void,
): PostflopSolveResult {
  onProgress?.("equity", 0, 1);
  const equityTable = runout
    ? runout.flopTable()
    : buildEquityTable(heroRange, villainRange, input.board, (done, total) => onProgress?.("equity", done, total));
  onProgress?.("equity", 1, 1);
  // Flop and turn solves look ahead past their own street (lookaheadOptions),
  // so they're solved against later play instead of checkdown equity.
  const street = streetForBoardLength(input.board.length);
  const lookahead = lookaheadOptions(street, input.fast);
  const tree = lookahead
    ? buildHandTree(input.startPot, input.effectiveStackBb, input.board, lookahead)
    : buildStreetTree(input.startPot, input.effectiveStackBb, street);
  const cfrOptions = { maxIterations: input.maxIterations, targetExploitabilityPercent: input.targetExploitabilityPercent };
  const cfrProgress = (done: number, total: number, exploitabilityPercent?: number) =>
    onProgress?.("cfr", done, total, exploitabilityPercent);
  const nativeInput = {
    tree,
    board: input.board,
    heroRange,
    villainRange,
    rootEquityTable: equityTable,
    equityTableFor: runout ? (board: string[]) => (board.length === 4 ? runout.turnTable(board[3]) : undefined) : undefined,
  };
  let session: NativeSolveSession | undefined;
  let solution: CfrSolution;
  if (lookahead) {
    const threads = engine.threads ?? 1;
    session =
      threads > 1
        ? solveThreadedSession(engine.solver, nativeInput, cfrOptions, cfrProgress, threads)
        : solveNativeSession(engine.solver, nativeInput, cfrOptions, cfrProgress);
    solution = session.solution;
  } else {
    solution = runNativeCfr(engine.solver, nativeInput, cfrOptions, cfrProgress);
  }
  const exploitability = solution.finalExploitability!;

  return { tree, heroRange, villainRange, solution, exploitability, equityTable, session };
}
