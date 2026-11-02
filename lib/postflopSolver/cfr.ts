import type { DecisionNode } from "./treeBuilder";
import type { ExploitabilityResult } from "./exploitability";

export interface CfrSolution {
  iterations: number;
  /** [comboIndex][actionIndex], normalized. `combos`/`actionLabels` on the node itself give you what each index means. */
  getAverageStrategy(node: DecisionNode): number[][];
  /** Set only when the early-stop check measured it at exactly `iterations` — i.e. it already describes this final strategy, so callers needn't recompute it. */
  finalExploitability?: ExploitabilityResult;
}

/**
 * See the Phase B-2 plan doc for the reasoning behind these defaults —
 * revisit once real wide-range (100bb, 130-190 combo/side) telemetry is
 * collected. Phase B-3 switched the underlying algorithm from CFR+ to DCFR,
 * which converges faster in practice — this hasn't been lowered pending
 * that same telemetry, since the early-stop mechanism already captures the
 * speedup without needing to touch the safety ceiling.
 */
export const DEFAULT_MAX_CFR_ITERATIONS = 20000;
/** Percent of pot. Loose end of TexasSolver's cited 0.275-0.5% range — this phase targets UX (not maximal precision). */
export const DEFAULT_TARGET_EXPLOITABILITY_PERCENT = 0.5;

export const DEFAULT_EXPLOITABILITY_CHECK_START_INTERVAL = 100;
const EXPLOITABILITY_CHECK_INTERVAL_CEILING = 2000;
/**
 * Each check costs about 3 iterations, and a solve overshoots its true
 * convergence point by up to one gap. Gaps 10% of the iteration count keep
 * both small (bench:postflop: a 3-bet pot stops at 509 iterations instead of
 * 800 with doubling gaps, against a true crossing near 550).
 */
const EXPLOITABILITY_CHECK_GROWTH = 1.1;

/** When to measure next after a check at iteration `t` (wasm/engine.ts). */
export function nextExploitabilityCheck(t: number): number {
  return t + Math.min(Math.max(1, Math.round(t * (EXPLOITABILITY_CHECK_GROWTH - 1))), EXPLOITABILITY_CHECK_INTERVAL_CEILING);
}

export interface CfrRunOptions {
  /** Hard safety cap — CFR always stops here even if the target was never reached. */
  maxIterations: number;
  /** Stop early once a periodic exploitability check reads at or below this (% of pot). Omit to disable early stopping entirely and always run exactly maxIterations. */
  targetExploitabilityPercent?: number;
  /** Iteration count of the first periodic exploitability check; after that each gap is EXPLOITABILITY_CHECK_GROWTH − 1 of the iteration count, capped at EXPLOITABILITY_CHECK_INTERVAL_CEILING. Default 100. */
  checkIntervalIterations?: number;
}
