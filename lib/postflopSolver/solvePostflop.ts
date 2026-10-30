import type { HandFrequency } from "@/types/rangeData";
import type { PostflopSolvePhase } from "@/types/postflopSolver";
import type { BoardCards, ComboRange } from "./types";
import { expandToCombos, filterBlockedCombos } from "./combos";
import { buildEquityTable, type EquityTable } from "./terminalEquity";
import { LOOKAHEAD_BET_SIZING, streetForBoardLength } from "./betAbstraction";
import { stratifiedNextCards } from "./nextCardSampling";
import { buildHandTree, buildStreetTree, type PostflopTreeNode } from "./treeBuilder";
import { runCfr, type CfrSolution } from "./cfr";
import type { ShowdownExecutor } from "./showdownExecutor";
import { computeExploitability, type ExploitabilityResult } from "./exploitability";
import { runNativeCfr, solveNativeSession, type NativeSolveSession } from "./wasm/engine";
import { solveSplitSession } from "./wasm/splitSolve";
import { LeafHelpersUnavailableError, workerLeafRunners } from "./worker/leafHelpers";
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
 * Which engine solves: the C++ one when its module is loaded (exact card
 * removal, unnormalized counterfactual values), otherwise the TypeScript one,
 * optionally with its showdown batch split across helper workers.
 */
export type PostflopEngine =
  | {
      solver: SolverModule;
      /** Helper workers (one port each) that take a share of a lookahead solve's leaves — see worker/leafHelpers.ts. */
      leafHelperPorts?: readonly MessagePort[];
    }
  | { showdownExecutor?: ShowdownExecutor };

export interface PostflopSolveResult {
  tree: PostflopTreeNode;
  heroRange: ComboRange;
  villainRange: ComboRange;
  solution: CfrSolution;
  exploitability: ExploitabilityResult;
  /** The board-fixed equity table this solve was run against — reused by checkdownEquity.ts to report per-node showdown averages without recomputing anything. */
  equityTable: EquityTable;
  /**
   * Set when the solve looked ahead past its street (a turn solve on the C++
   * engine): the engine is kept alive so the caller can read values below the
   * street's end (nextStreetEv.ts) before disposing it, which it must.
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
  onProgress?: (phase: PostflopSolvePhase, done: number, total: number, exploitabilityPercent?: number) => void,
  engine: PostflopEngine = {},
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

  const equityTable = buildEquityTable(heroRange, villainRange, input.board, (done, total) =>
    onProgress?.("equity", done, total),
  );
  // A turn solve on the C++ engine looks ahead into the river (a stratified
  // sample of river cards, a reduced river menu), so the turn is solved against
  // real river play instead of checkdown equity. The river itself is re-solved
  // with its full menu once its card is picked. (The TypeScript engine is
  // single-street only.)
  const street = streetForBoardLength(input.board.length);
  const throughRiver = "solver" in engine && street === "turn";
  const tree = throughRiver
    ? buildHandTree(input.startPot, input.effectiveStackBb, input.board, {
        dealNextCards: (board) => stratifiedNextCards(board, LOOKAHEAD_RIVER_CARDS),
        laterStreetSizing: LOOKAHEAD_BET_SIZING,
      })
    : buildStreetTree(input.startPot, input.effectiveStackBb, street);
  const cfrOptions = { maxIterations: input.maxIterations, targetExploitabilityPercent: input.targetExploitabilityPercent };
  const cfrProgress = (done: number, total: number, exploitabilityPercent?: number) =>
    onProgress?.("cfr", done, total, exploitabilityPercent);
  const nativeInput = { tree, board: input.board, heroRange, villainRange, rootEquityTable: equityTable };
  let session: NativeSolveSession | undefined;
  let solution: CfrSolution;
  if (!("solver" in engine)) {
    solution = runCfr(tree, heroRange, villainRange, equityTable, { ...cfrOptions, showdownExecutor: engine.showdownExecutor }, cfrProgress);
  } else if (throughRiver) {
    session = solveLookahead(engine.solver, engine.leafHelperPorts ?? [], nativeInput, cfrOptions, cfrProgress);
    solution = session.solution;
  } else {
    solution = runNativeCfr(engine.solver, nativeInput, cfrOptions, cfrProgress);
  }
  const exploitability =
    solution.finalExploitability ??
    computeExploitability(tree, solution, heroRange, villainRange, equityTable, input.startPot);

  return { tree, heroRange, villainRange, solution, exploitability, equityTable, session };
}

/** A lookahead solve, its leaves spread over the helper workers when there are any (falling back to this thread if they can't start). */
function solveLookahead(
  solver: SolverModule,
  ports: readonly MessagePort[],
  input: Parameters<typeof solveNativeSession>[1],
  options: Parameters<typeof solveNativeSession>[2],
  onProgress: Parameters<typeof solveNativeSession>[3],
): NativeSolveSession {
  if (ports.length > 0) {
    try {
      return solveSplitSession(solver, input, options, onProgress, ports.length + 1, workerLeafRunners(ports));
    } catch (err) {
      if (!(err instanceof LeafHelpersUnavailableError)) throw err;
    }
  }
  return solveNativeSession(solver, input, options, onProgress);
}
