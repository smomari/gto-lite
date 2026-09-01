import type { HandFrequency } from "@/types/rangeData";
import type { BoardCards, ComboRange } from "./types";
import { expandToCombos, filterBlockedCombos } from "./combos";
import { buildEquityTable } from "./terminalEquity";
import { buildStreetTree, type PostflopTreeNode } from "./treeBuilder";
import { runCfr, type CfrSolution } from "./cfr";

interface PostflopSolveInputCommon {
  board: BoardCards;
  /** Pot size entering the street. */
  startPot: number;
  /** Effective stack behind, shared by both players (mirrors the preflop tool's uniform-stack model). */
  effectiveStackBb: number;
  iterations: number;
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

export interface PostflopSolveResult {
  tree: PostflopTreeNode;
  heroRange: ComboRange;
  villainRange: ComboRange;
  solution: CfrSolution;
}

export type PostflopSolvePhase = "equity" | "cfr";

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
  onProgress?: (phase: PostflopSolvePhase, done: number, total: number) => void,
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
  const tree = buildStreetTree(input.startPot, input.effectiveStackBb);
  const solution = runCfr(tree, heroRange, villainRange, equityTable, input.iterations, (done, total) =>
    onProgress?.("cfr", done, total),
  );

  return { tree, heroRange, villainRange, solution };
}
