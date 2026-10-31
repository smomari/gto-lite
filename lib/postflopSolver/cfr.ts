import type { ComboRange } from "./types";
import type { EquityTable } from "./terminalEquity";
import { singleStreetOnly, type DecisionNode, type PostflopTreeNode, type TerminalShowdownNode } from "./treeBuilder";
import { computeExploitability, type ExploitabilityResult } from "./exploitability";
import { totalPot } from "./potState";
import { deriveShowdownLayout, opponentCardWeights, showdownEquities } from "./showdownBatch";
import { narrowReach, rangeAverageActionProbs, terminalUtilities } from "./treeMath";

interface CfrNodeData {
  /**
   * [comboIndex][actionIndex], DCFR cumulative regret. Signed — NOT floored
   * at 0 like the previous CFR+ implementation. Discounted every iteration:
   * after adding this iteration's delta, the resulting value is multiplied
   * by `t^α/(t^α+1)` if positive, or a constant 0.5 (= `t^β/(t^β+1)` with
   * β=0) if negative or zero. The discount compounds across iterations
   * since it's applied to the stored cumulative value each time, not just
   * to the new delta. See DCFR_ALPHA/DCFR_NEGATIVE_REGRET_DISCOUNT.
   */
  regret: number[][];
  /**
   * [comboIndex][actionIndex], DCFR-weighted accumulation for the averaged
   * (equilibrium) strategy. Each iteration's contribution is scaled by
   * `t^γ` (steeper than CFR+'s plain linear `t` weighting), so later
   * iterations dominate the average more aggressively. See DCFR_GAMMA.
   */
  stratSum: number[][];
  /** This iteration's regret-matching strategy and the reach arriving here — set by the forward pass, read by the backward pass. */
  strategy: number[][];
  reachP1: number[];
  reachP2: number[];
}

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

/** When to measure next after a check at iteration `t` — shared by both engines (wasm/engine.ts). */
export function nextExploitabilityCheck(t: number): number {
  return t + Math.min(Math.max(1, Math.round(t * (EXPLOITABILITY_CHECK_GROWTH - 1))), EXPLOITABILITY_CHECK_INTERVAL_CEILING);
}

/**
 * DCFR (Brown & Sandholm 2019) discount exponents — these replace CFR+'s
 * hard floor-at-0 regret with a smooth, signed discount. α controls how much
 * positive cumulative regret is retained iteration-to-iteration; β controls
 * the same for negative/zero regret; γ controls how strongly later
 * iterations dominate the averaged (equilibrium) strategy. α=1.5, β=0 are
 * the paper's defaults; γ=3 (paper: 2) follows postflop-solver and, with the
 * power-of-4 average reset below, reached the 0.5% target in ~10% fewer
 * iterations on bench:postflop (SRP 2850 vs 3200, 3-bet pot 550 vs 600).
 */
const DCFR_ALPHA = 1.5;
const DCFR_GAMMA = 3;

/** Drop the average strategy at iterations 4, 16, 64, … so the noisy early iterates stop weighing on it. */
function isAverageResetIteration(t: number): boolean {
  return t > 1 && (t & (t - 1)) === 0 && Math.log2(t) % 2 === 0;
}
/**
 * t^β/(t^β+1) with β=0 is 1/(1+1) = 0.5 for every t (t^0 is always 1) —
 * hardcoded as a constant rather than computed per-iteration. If a nonzero β
 * is ever wanted, this must become a per-iteration
 * Math.pow(t, beta) / (Math.pow(t, beta) + 1) again.
 */
const DCFR_NEGATIVE_REGRET_DISCOUNT = 0.5;

export interface CfrRunOptions {
  /** Hard safety cap — CFR always stops here even if the target was never reached. */
  maxIterations: number;
  /** Stop early once a periodic exploitability check reads at or below this (% of pot). Omit to disable early stopping entirely and always run exactly maxIterations. */
  targetExploitabilityPercent?: number;
  /** Iteration count of the first periodic exploitability check; after that each gap is EXPLOITABILITY_CHECK_GROWTH − 1 of the iteration count, capped at EXPLOITABILITY_CHECK_INTERVAL_CEILING. Default 100. */
  checkIntervalIterations?: number;
}

/**
 * Range-vector DCFR: instead of one regret table per literal information-set
 * string, hero's and villain's entire ranges are tracked as reach-probability
 * arrays threaded through the tree (parallel to `heroCombos`/`villainCombos`),
 * so one traversal updates every combo's strategy at once. Regret/average-
 * strategy accumulation follows Brown & Sandholm 2019's Discounted CFR (see
 * DCFR_ALPHA/DCFR_GAMMA/DCFR_NEGATIVE_REGRET_DISCOUNT above). See the plan
 * doc for the algorithm's derivation; this is the concrete implementation of it.
 */
export function runCfr(
  tree: PostflopTreeNode,
  heroRange: ComboRange,
  villainRange: ComboRange,
  equityTable: EquityTable,
  options: CfrRunOptions,
  onProgress?: (done: number, total: number, exploitabilityPercent?: number) => void,
): CfrSolution {
  const { maxIterations, targetExploitabilityPercent, checkIntervalIterations } = options;
  const heroCombos = heroRange.map((c) => c.cards);
  const villainCombos = villainRange.map((c) => c.cards);
  const initialReachP1 = heroRange.map((c) => c.weight);
  const initialReachP2 = villainRange.map((c) => c.weight);

  const heroCount = heroCombos.length;
  const villainCount = villainCombos.length;

  const cfrData = new Map<DecisionNode, CfrNodeData>();
  const showdownIndex = new Map<TerminalShowdownNode, number>();
  (function initNodes(node: PostflopTreeNode) {
    if (node.type === "chance") singleStreetOnly("runCfr");
    if (node.type === "terminal-showdown") showdownIndex.set(node, showdownIndex.size);
    if (node.type !== "decision") return;
    const rangeSize = node.actor === "P1" ? heroCount : villainCount;
    const numActions = node.actions.length;
    cfrData.set(node, {
      regret: Array.from({ length: rangeSize }, () => new Array(numActions).fill(0)),
      stratSum: Array.from({ length: rangeSize }, () => new Array(numActions).fill(0)),
      strategy: Array.from({ length: rangeSize }, () => new Array(numActions).fill(0)),
      reachP1: initialReachP1,
      reachP2: initialReachP2,
    });
    for (const { child } of node.actions) initNodes(child);
  })(tree);

  // Showdown values are most of an iteration's cost (bench:postflop: ~75%), so
  // each iteration runs in three passes: forward (strategies + reach to every
  // node), every showdown node evaluated in one batch, then backward (utilities
  // + updates). The batch's arrays are node-major, `[node * combos + combo]`.
  const showdownCount = showdownIndex.size;
  const heroLayout = deriveShowdownLayout(equityTable.heroEquity, heroCombos, villainCombos);
  const villainLayout = deriveShowdownLayout(equityTable.villainEquity, villainCombos, heroCombos);
  const showdown = {
    heroReach: new Float64Array(showdownCount * heroCount),
    villainReach: new Float64Array(showdownCount * villainCount),
    heroEquity: new Float64Array(showdownCount * heroCount),
    villainEquity: new Float64Array(showdownCount * villainCount),
    evaluate() {
      const villainWeights = opponentCardWeights(heroLayout, showdown.villainReach, showdownCount);
      const heroWeights = opponentCardWeights(villainLayout, showdown.heroReach, showdownCount);
      showdownEquities(heroLayout, showdown.villainReach, villainWeights, showdownCount, 0, heroCount, showdown.heroEquity);
      showdownEquities(villainLayout, showdown.heroReach, heroWeights, showdownCount, 0, villainCount, showdown.villainEquity);
    },
  };

  /** Regret matching, written into a row reused every iteration. */
  function regretMatchInto(regrets: number[], out: number[]): void {
    let positiveSum = 0;
    for (let a = 0; a < regrets.length; a++) if (regrets[a] > 0) positiveSum += regrets[a];
    if (positiveSum <= 0) {
      out.fill(1 / regrets.length);
      return;
    }
    for (let a = 0; a < regrets.length; a++) out[a] = regrets[a] > 0 ? regrets[a] / positiveSum : 0;
  }

  function forward(node: PostflopTreeNode, reachP1: number[], reachP2: number[]): void {
    if (node.type === "terminal-fold") return;
    if (node.type === "chance") singleStreetOnly("runCfr");
    if (node.type === "terminal-showdown") {
      const s = showdownIndex.get(node)!;
      showdown.villainReach.set(reachP2, s * villainCount);
      showdown.heroReach.set(reachP1, s * heroCount);
      return;
    }

    const data = cfrData.get(node)!;
    const isP1Acting = node.actor === "P1";
    data.reachP1 = reachP1;
    data.reachP2 = reachP2;
    for (let c = 0; c < data.regret.length; c++) regretMatchInto(data.regret[c], data.strategy[c]);
    node.actions.forEach((edge, a) => {
      const childReachP1 = isP1Acting ? narrowReach(reachP1, data.strategy, a) : reachP1;
      const childReachP2 = isP1Acting ? reachP2 : narrowReach(reachP2, data.strategy, a);
      forward(edge.child, childReachP1, childReachP2);
    });
  }

  function showdownUtilities(node: TerminalShowdownNode): { utilP1: number[]; utilP2: number[] } {
    const s = showdownIndex.get(node)!;
    const pot = totalPot(node.state);
    const { P1: committedP1, P2: committedP2 } = node.state.committed;
    const utilP1 = new Array<number>(heroCount);
    for (let i = 0; i < heroCount; i++) utilP1[i] = showdown.heroEquity[s * heroCount + i] * pot - committedP1;
    const utilP2 = new Array<number>(villainCount);
    for (let j = 0; j < villainCount; j++) utilP2[j] = showdown.villainEquity[s * villainCount + j] * pot - committedP2;
    return { utilP1, utilP2 };
  }

  function backward(
    node: PostflopTreeNode,
    positiveDiscount: number,
    negativeDiscount: number,
    stratWeight: number,
  ): { utilP1: number[]; utilP2: number[] } {
    if (node.type === "terminal-showdown") return showdownUtilities(node);
    if (node.type === "chance") singleStreetOnly("runCfr");
    if (node.type === "terminal-fold") {
      // A fold's payoff doesn't depend on the opponent's holding, so no reach is needed.
      return {
        utilP1: terminalUtilities(node, "P1", heroCount, initialReachP2, equityTable),
        utilP2: terminalUtilities(node, "P2", villainCount, initialReachP1, equityTable),
      };
    }

    // Decision node.
    const data = cfrData.get(node)!;
    const isP1Acting = node.actor === "P1";
    const actingCombos = isP1Acting ? heroCombos : villainCombos;
    const actingReach = isP1Acting ? data.reachP1 : data.reachP2;
    const numActions = node.actions.length;
    const strategy = data.strategy;

    const childResults = node.actions.map((edge) =>
      backward(edge.child, positiveDiscount, negativeDiscount, stratWeight),
    );

    // Acting player's utility per their own combo, under their own (per-combo) strategy.
    const actingUtil = actingCombos.map((_, c) => {
      let v = 0;
      for (let a = 0; a < numActions; a++) {
        v += strategy[c][a] * (isP1Acting ? childResults[a].utilP1[c] : childResults[a].utilP2[c]);
      }
      return v;
    });

    const avgActionProb = rangeAverageActionProbs(actingReach, strategy, numActions);
    const nonActingCombos = isP1Acting ? villainCombos : heroCombos;
    const nonActingUtil = nonActingCombos.map((_, c) => {
      let v = 0;
      for (let a = 0; a < numActions; a++) {
        v += avgActionProb[a] * (isP1Acting ? childResults[a].utilP2[c] : childResults[a].utilP1[c]);
      }
      return v;
    });

    // DCFR regret update (Brown & Sandholm 2019): cumulative regret stays
    // signed — no floor at 0, unlike CFR+ — and the resulting value (old
    // regret + this iteration's delta) is discounted every iteration:
    // `positiveDiscount` if it's positive, `negativeDiscount` if it's
    // negative or zero. Since the discount is applied to the stored
    // cumulative value each time (not just the new delta), it compounds
    // across iterations. Average-strategy accumulation uses `stratWeight`
    // (t^γ) instead of CFR+'s plain linear `t` weighting.
    for (let c = 0; c < actingCombos.length; c++) {
      for (let a = 0; a < numActions; a++) {
        const actionUtil = isP1Acting ? childResults[a].utilP1[c] : childResults[a].utilP2[c];
        const regretDelta = actionUtil - actingUtil[c];
        const updatedRegret = data.regret[c][a] + regretDelta;
        data.regret[c][a] = updatedRegret * (updatedRegret > 0 ? positiveDiscount : negativeDiscount);
        data.stratSum[c][a] += stratWeight * actingReach[c] * strategy[c][a];
      }
    }

    return isP1Acting
      ? { utilP1: actingUtil, utilP2: nonActingUtil }
      : { utilP1: nonActingUtil, utilP2: actingUtil };
  }

  function getAverageStrategy(node: DecisionNode): number[][] {
    const data = cfrData.get(node);
    if (!data) throw new Error("getAverageStrategy: node was not part of the solved tree");
    return data.stratSum.map((row) => {
      const sum = row.reduce((s, x) => s + x, 0);
      if (sum <= 0) return row.map(() => 1 / row.length);
      return row.map((x) => x / sum);
    });
  }

  const progressInterval = Math.max(1, Math.floor(maxIterations / 50));
  let nextCheck = checkIntervalIterations ?? DEFAULT_EXPLOITABILITY_CHECK_START_INTERVAL;
  for (let t = 1; t <= maxIterations; t++) {
    // Discount factors depend only on t, not on the node/combo/action being
    // updated, so compute them once per outer iteration rather than
    // redundantly at every node visited during this traversal.
    const tAlpha = Math.pow(t, DCFR_ALPHA);
    const positiveDiscount = tAlpha / (tAlpha + 1);
    const stratWeight = Math.pow(t, DCFR_GAMMA);
    if (isAverageResetIteration(t)) {
      for (const data of cfrData.values()) for (const row of data.stratSum) row.fill(0);
    }
    forward(tree, initialReachP1, initialReachP2);
    showdown.evaluate();
    backward(tree, positiveDiscount, DCFR_NEGATIVE_REGRET_DISCOUNT, stratWeight);

    if (targetExploitabilityPercent !== undefined && t >= nextCheck) {
      const snapshot: CfrSolution = { iterations: t, getAverageStrategy };
      const exploitability = computeExploitability(
        tree,
        snapshot,
        heroRange,
        villainRange,
        equityTable,
        tree.state.startPot,
      );
      nextCheck = nextExploitabilityCheck(t);
      onProgress?.(t, maxIterations, exploitability.percentOfPot);
      if (exploitability.percentOfPot <= targetExploitabilityPercent) {
        return { iterations: t, getAverageStrategy, finalExploitability: exploitability };
      }
      continue;
    }

    if (onProgress && (t % progressInterval === 0 || t === maxIterations)) onProgress(t, maxIterations);
  }

  return { iterations: maxIterations, getAverageStrategy };
}
