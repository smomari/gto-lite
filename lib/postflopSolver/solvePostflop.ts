import type { HandFrequency } from "@/types/rangeData";
import type { BoardCards, ComboRange } from "./types";
import { expandToCombos } from "./combos";
import { buildEquityTable } from "./terminalEquity";
import { buildStreetTree, type PostflopTreeNode } from "./treeBuilder";
import { runCfr, type CfrSolution } from "./cfr";

export interface PostflopSolveInput {
  board: BoardCards;
  heroHandFrequencies: HandFrequency[];
  /** Which of hero's fold/call/raise/allin frequencies defines their range entering this street. */
  heroActionWeight: (hf: HandFrequency) => number;
  villainHandFrequencies: HandFrequency[];
  villainActionWeight: (hf: HandFrequency) => number;
  /** Pot size entering the street. */
  startPot: number;
  /** Effective stack behind, shared by both players (mirrors the preflop tool's uniform-stack model). */
  effectiveStackBb: number;
  iterations: number;
}

export interface PostflopSolveResult {
  tree: PostflopTreeNode;
  heroRange: ComboRange;
  villainRange: ComboRange;
  solution: CfrSolution;
}

export type PostflopSolvePhase = "equity" | "cfr";

/** Top-level Phase 1 orchestrator: preflop HandFrequency[] pairs in, a solved flop street tree out. */
export function solvePostflopStreet(
  input: PostflopSolveInput,
  onProgress?: (phase: PostflopSolvePhase, done: number, total: number) => void,
): PostflopSolveResult {
  const heroRange = expandToCombos(input.heroHandFrequencies, input.heroActionWeight, input.board);
  const villainRange = expandToCombos(input.villainHandFrequencies, input.villainActionWeight, input.board);

  if (heroRange.length === 0 || villainRange.length === 0) {
    throw new Error("solvePostflopStreet: hero and villain ranges must both be non-empty after board removal");
  }

  const equityTable = buildEquityTable(heroRange, villainRange, input.board, (done, total) =>
    onProgress?.("equity", done, total),
  );
  const tree = buildStreetTree(input.startPot, input.effectiveStackBb);
  const solution = runCfr(tree, heroRange, villainRange, equityTable, input.iterations, (done, total) =>
    onProgress?.("cfr", done, total),
  );

  return { tree, heroRange, villainRange, solution };
}
