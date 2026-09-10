import type { Position, HandFrequency } from "@/types/rangeData";
import type { EquityMatrix } from "@/lib/equity/loadEquityMatrix";
import { runCfr, type CfrRunOptions } from "@/lib/postflopSolver/cfr";
import { computeExploitability, type ExploitabilityResult } from "@/lib/postflopSolver/exploitability";
import { canonicalRfiRange, HERO_SUITS, VILLAIN_SUITS } from "./canonicalRange";
import { buildPreflopEquityTable } from "./preflopEquityTable";
import { buildRfiTree } from "./rfiTree";
import { extractOpenerRootFrequencies } from "./exportFrequencies";

export interface RfiSolveResult {
  openSizeBb: number;
  threeBetSizeBb: number;
  hands: HandFrequency[];
  exploitability: ExploitabilityResult;
  iterations: number;
}

/**
 * Solves one opening seat's RFI decision as a joint 2-player CFR equilibrium
 * (opener vs BB, see rfiTree.ts) and extracts the opener's root-node
 * open/fold frequencies. Mirrors solvePostflop.ts's own orchestration shape
 * (equity table -> tree -> CFR -> exploitability).
 *
 * IMPORTANT — only valid for a genuinely 2-player spot (SB opening into BB).
 * For any other opener, this 2-player reduction collapses "the whole field
 * behind you" into "just BB," which removes almost all the fold-equity
 * pressure that makes early/middle positions tight — both this joint-CFR
 * solve and a fixed-BB-best-response variant were tried and produced
 * unrealistically wide (66-100% open) ranges for non-SB seats. See the
 * Phase C-1 plan doc's writeup. Only call this for openerSeat === "SB";
 * scripts/generate-preflop-rfi.ts enforces that at the generation boundary.
 */
export function solveRfi(
  openerSeat: Position,
  matrix: EquityMatrix,
  effectiveStackBb: number,
  cfrOptions: CfrRunOptions,
  onProgress?: (done: number, total: number, exploitabilityPercent?: number) => void,
): RfiSolveResult {
  const heroRange = canonicalRfiRange(HERO_SUITS);
  const villainRange = canonicalRfiRange(VILLAIN_SUITS);
  const equityTable = buildPreflopEquityTable(heroRange, villainRange, matrix);
  const { tree, openSizeBb, threeBetSizeBb } = buildRfiTree(openerSeat, effectiveStackBb);
  const solution = runCfr(tree, heroRange, villainRange, equityTable, cfrOptions, onProgress);
  const exploitability = computeExploitability(tree, solution, heroRange, villainRange, equityTable, tree.state.startPot);
  return {
    openSizeBb,
    threeBetSizeBb,
    hands: extractOpenerRootFrequencies(tree, solution, heroRange),
    exploitability,
    iterations: solution.iterations,
  };
}
