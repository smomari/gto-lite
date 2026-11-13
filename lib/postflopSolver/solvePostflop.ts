import type { HandFrequency } from "@/types/rangeData";
import type { PostflopSolvePhase } from "@/types/postflopSolver";
import type { BoardCards, ComboRange } from "./types";
import { expandToCombos, filterBlockedCombos } from "./combos";
import { buildEquityTable, type EquityTable } from "./terminalEquity";
import { LOOKAHEAD_BET_SIZING, streetForBoardLength, type PostflopStreet } from "./betAbstraction";
import { EVERY_CANDIDATE, flopMenu, offersOpeningAllin, pickFlopSizes } from "./flopSizing";
import { clusteredNextCards, stratifiedNextCards } from "./nextCardSampling";
import { buildHandTree, buildStreetTree, type HandTreeOptions, type PostflopTreeNode } from "./treeBuilder";
import type { CfrSolution } from "./cfr";
import type { RakeTerms } from "@/lib/solveEngine/rake";
import type { PostflopIcm } from "./icmPayoffs";
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
  /** Hard safety cap on CFR iterations — passed straight through to the engine, no default injected here. */
  maxIterations: number;
  /** Stop CFR early once measured exploitability is at or below this (% of pot). Omit to disable early stopping. */
  targetExploitabilityPercent?: number;
  /** Flop only: stop the lookahead at the turn (FLOP_FAST_LOOKAHEAD), for a quicker, less accurate solve. */
  fast?: boolean;
  /** Taken from every pot. Postflop pots have seen a flop, so no-flop-no-drop makes no difference here. */
  rake?: RakeTerms;
  /** A tournament hand: pay terminals in prize money (icmPayoffs.ts). Omit for chip EV. */
  icm?: PostflopIcm;
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
 * Turn cards a flop solve looks ahead into, chosen for how they play against
 * these ranges (clusteredNextCards), and stratified river cards under each.
 * `npm run accuracy:postflop` prices each lookahead's flop strategy against a
 * tree with every turn and river, as the pot share both players lose together.
 * Against 10 stratified turns, 16 clustered ones took a BTN-vs-BB spot from
 * 1.76% to 1.27%, narrowed SRPs from 2.65% to 2.06% and 3-bet pots from 3.44% to
 * 2.09%, better on all 10 boards, and 3.35% to 1.59% on 3 boards held back from
 * tuning. 12 cards made one worse. Those figures are from the 50/100% flop menu. With
 * the sizes picked first (flopSizing), a BTN-vs-BB flop takes 2.6 to 3.7s in
 * Node on nine threads, the pick included.
 */
export const FLOP_LOOKAHEAD = { turnCards: 16, riverCards: 6 };

/** The opt-in quicker flop lookahead: stratified turns, then a checkdown. The same flop takes 1.1s. */
export const FLOP_FAST_LOOKAHEAD = { turnCards: 10, riverCards: 0 };

/**
 * How a street's solve looks past its own end, or null when it doesn't (the
 * river). Later streets get the reduced LOOKAHEAD_BET_SIZING menu, and under a
 * flop a sample of their cards; each is re-solved with its full menu once its
 * card is picked. `turnFeatures` lets a full flop lookahead cluster its turns.
 */
export function lookaheadOptions(street: PostflopStreet, fast = false, turnFeatures?: (card: string) => Float32Array): HandTreeOptions | null {
  if (street === "turn") {
    // Every river: on BTN-vs-BB turns it loses 0.1–0.3% of the pot against 12 sampled rivers' 1–2.5%, for about 1s.
    return { laterStreetSizing: LOOKAHEAD_BET_SIZING };
  }
  if (street === "flop") {
    const { turnCards, riverCards } = fast ? FLOP_FAST_LOOKAHEAD : FLOP_LOOKAHEAD;
    // Every line that closes the flop deals the same turns, and choosing them is the costly part.
    let clusteredTurns: ReturnType<typeof clusteredNextCards> | undefined;
    return {
      dealNextCards: (board) => {
        if (board.length === 3 && turnFeatures && !fast) return (clusteredTurns ??= clusteredNextCards(board, turnCards, turnFeatures));
        return stratifiedNextCards(board, board.length === 3 ? turnCards : riverCards);
      },
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

/** A narrowed range's combos that are still live: not on the board, and with some reach left. */
function inPlay(range: ComboRange, board: BoardCards): ComboRange {
  return filterBlockedCombos(range, board).filter((combo) => combo.weight > 0);
}

/** With no pair of hands that can both exist, nothing is left to solve: the engine would report a converged uniform strategy. */
function anyPairDealable(heroRange: ComboRange, villainRange: ComboRange): boolean {
  return heroRange.some(({ cards: hero }) => villainRange.some(({ cards: villain }) => !villain.some((card) => hero.includes(card))));
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
      : inPlay(input.heroRange, input.board);
  const villainRange =
    input.kind === "canonical"
      ? expandToCombos(input.villainHandFrequencies, input.villainActionWeight, input.board)
      : inPlay(input.villainRange, input.board);

  if (!anyPairDealable(heroRange, villainRange)) {
    throw new Error("This line is never reached at equilibrium.");
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
  const cfrOptions = { maxIterations: input.maxIterations, targetExploitabilityPercent: input.targetExploitabilityPercent };
  const inputFor = (tree: PostflopTreeNode) => ({
    tree,
    board: input.board,
    heroRange,
    villainRange,
    rootEquityTable: equityTable,
    rake: input.rake,
    icm: input.icm && { ...input.icm, remainingBb: input.effectiveStackBb },
    equityTableFor: runout ? (board: string[]) => (board.length === 4 ? runout.turnTable(board[3]) : undefined) : undefined,
  });
  const threads = engine.threads ?? 1;
  const solveLookahead = (tree: PostflopTreeNode, phase: PostflopSolvePhase) => {
    const progress = (done: number, total: number, exploitabilityPercent?: number) => onProgress?.(phase, done, total, exploitabilityPercent);
    return threads > 1
      ? solveThreadedSession(engine.solver, inputFor(tree), cfrOptions, progress, threads)
      : solveNativeSession(engine.solver, inputFor(tree), cfrOptions, progress);
  };

  // A flop first finds the bet sizes this spot uses, on the quick lookahead
  // with every candidate, and is then solved with two of them per player.
  let flopSizing: HandTreeOptions["firstStreetSizing"];
  if (street === "flop") {
    const allinOpen = offersOpeningAllin(input.startPot, input.effectiveStackBb);
    const everySize = buildHandTree(input.startPot, input.effectiveStackBb, input.board, {
      ...lookaheadOptions("flop", true)!,
      firstStreetSizing: flopMenu(EVERY_CANDIDATE, allinOpen),
    });
    // Nothing to pick when both players are already all-in.
    if (everySize.type === "decision") {
      const pass = solveLookahead(everySize, "sizes");
      flopSizing = flopMenu(pickFlopSizes(everySize, pass.solution, heroRange, villainRange), allinOpen);
      pass.dispose();
    }
  }

  const lookahead = lookaheadOptions(street, input.fast, runout ? (card) => runout.turnFeatures(card, heroRange, villainRange) : undefined);
  const tree = lookahead
    ? buildHandTree(input.startPot, input.effectiveStackBb, input.board, { ...lookahead, firstStreetSizing: flopSizing })
    : buildStreetTree(input.startPot, input.effectiveStackBb, street);
  let session: NativeSolveSession | undefined;
  let solution: CfrSolution;
  if (lookahead) {
    session = solveLookahead(tree, "cfr");
    solution = session.solution;
  } else {
    solution = runNativeCfr(engine.solver, inputFor(tree), cfrOptions, (done, total, exploitabilityPercent) =>
      onProgress?.("cfr", done, total, exploitabilityPercent),
    );
  }
  const exploitability = solution.finalExploitability!;

  return { tree, heroRange, villainRange, solution, exploitability, equityTable, session };
}
