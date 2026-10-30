import type { HandFrequency } from "@/types/rangeData";
import type { PostflopSolvePhase } from "@/types/postflopSolver";
import type { BoardCards, ComboRange } from "./types";
import { expandToCombos, filterBlockedCombos } from "./combos";
import { buildEquityTable, type EquityTable } from "./terminalEquity";
import { streetForBoardLength } from "./betAbstraction";
import { buildStreetTree, type PostflopTreeNode } from "./treeBuilder";
import { runCfr, type CfrSolution } from "./cfr";
import type { ShowdownExecutor } from "./showdownExecutor";
import { computeExploitability, type ExploitabilityResult } from "./exploitability";
import { runNativeCfr } from "./wasm/engine";
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
 * Which engine solves: the C++ one when its module is loaded (exact card
 * removal, unnormalized counterfactual values), otherwise the TypeScript one,
 * optionally with its showdown batch split across helper workers.
 */
export type PostflopEngine = { solver: SolverModule } | { showdownExecutor?: ShowdownExecutor };

export interface PostflopSolveResult {
  tree: PostflopTreeNode;
  heroRange: ComboRange;
  villainRange: ComboRange;
  solution: CfrSolution;
  exploitability: ExploitabilityResult;
  /** The board-fixed equity table this solve was run against — reused by checkdownEquity.ts to report per-node showdown averages without recomputing anything. */
  equityTable: EquityTable;
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
  const tree = buildStreetTree(input.startPot, input.effectiveStackBb, streetForBoardLength(input.board.length));
  const cfrOptions = { maxIterations: input.maxIterations, targetExploitabilityPercent: input.targetExploitabilityPercent };
  const cfrProgress = (done: number, total: number, exploitabilityPercent?: number) =>
    onProgress?.("cfr", done, total, exploitabilityPercent);
  const solution =
    "solver" in engine
      ? runNativeCfr(engine.solver, { tree, board: input.board, heroRange, villainRange, rootEquityTable: equityTable }, cfrOptions, cfrProgress)
      : runCfr(tree, heroRange, villainRange, equityTable, { ...cfrOptions, showdownExecutor: engine.showdownExecutor }, cfrProgress);
  const exploitability =
    solution.finalExploitability ??
    computeExploitability(tree, solution, heroRange, villainRange, equityTable, input.startPot);

  return { tree, heroRange, villainRange, solution, exploitability, equityTable };
}
