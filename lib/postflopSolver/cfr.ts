import type { ComboRange } from "./types";
import type { EquityTable } from "./terminalEquity";
import { equityVsRange } from "./terminalEquity";
import { totalPot } from "./potState";
import type { DecisionNode, PostflopTreeNode } from "./treeBuilder";
import { computeExploitability } from "./exploitability";

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
}

export interface CfrSolution {
  iterations: number;
  /** [comboIndex][actionIndex], normalized. `combos`/`actionLabels` on the node itself give you what each index means. */
  getAverageStrategy(node: DecisionNode): number[][];
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

const DEFAULT_EXPLOITABILITY_CHECK_START_INTERVAL = 100;
const EXPLOITABILITY_CHECK_INTERVAL_CEILING = 2000;

/**
 * DCFR (Brown & Sandholm 2019) discount exponents — these replace CFR+'s
 * hard floor-at-0 regret with a smooth, signed discount. α controls how much
 * positive cumulative regret is retained iteration-to-iteration; β controls
 * the same for negative/zero regret; γ controls how strongly later
 * iterations dominate the averaged (equilibrium) strategy. 1.5 / 0 / 2 are
 * the paper's own recommended defaults (best empirical performance across
 * their benchmark games, §8) — no local tuning has been done yet, revisit
 * only if telemetry on this codebase's actual scenarios suggests otherwise.
 */
const DCFR_ALPHA = 1.5;
const DCFR_GAMMA = 2;
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
  /** Iteration count of the first periodic exploitability check; the gap doubles after that, capped at EXPLOITABILITY_CHECK_INTERVAL_CEILING. Default 100. */
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

  const cfrData = new Map<DecisionNode, CfrNodeData>();
  (function initNodes(node: PostflopTreeNode) {
    if (node.type !== "decision") return;
    const rangeSize = node.actor === "P1" ? heroCombos.length : villainCombos.length;
    const numActions = node.actions.length;
    cfrData.set(node, {
      regret: Array.from({ length: rangeSize }, () => new Array(numActions).fill(0)),
      stratSum: Array.from({ length: rangeSize }, () => new Array(numActions).fill(0)),
    });
    for (const { child } of node.actions) initNodes(child);
  })(tree);

  function regretMatchingStrategy(regrets: number[], numActions: number): number[] {
    const positiveSum = regrets.reduce((s, r) => s + Math.max(0, r), 0);
    if (positiveSum <= 0) return new Array(numActions).fill(1 / numActions);
    return regrets.map((r) => Math.max(0, r) / positiveSum);
  }

  function traverse(
    node: PostflopTreeNode,
    reachP1: number[],
    reachP2: number[],
    positiveDiscount: number,
    negativeDiscount: number,
    stratWeight: number,
  ): { utilP1: number[]; utilP2: number[] } {
    if (node.type === "terminal-fold") {
      const pot = totalPot(node.state);
      const p1Wins = node.winner === "P1";
      const utilP1 = heroCombos.map(() => (p1Wins ? pot - node.state.committed.P1 : -node.state.committed.P1));
      const utilP2 = villainCombos.map(() => (!p1Wins ? pot - node.state.committed.P2 : -node.state.committed.P2));
      return { utilP1, utilP2 };
    }

    if (node.type === "terminal-showdown") {
      const pot = totalPot(node.state);
      const villainWeighted: ComboRange = villainCombos.map((cards, i) => ({ cards, weight: reachP2[i] }));
      const heroWeighted: ComboRange = heroCombos.map((cards, i) => ({ cards, weight: reachP1[i] }));
      const utilP1 = heroCombos.map(
        (cards) => equityVsRange(equityTable, cards, villainWeighted) * pot - node.state.committed.P1,
      );
      const utilP2 = villainCombos.map(
        (cards) => equityVsRange(equityTable, cards, heroWeighted) * pot - node.state.committed.P2,
      );
      return { utilP1, utilP2 };
    }

    // Decision node.
    const data = cfrData.get(node)!;
    const isP1Acting = node.actor === "P1";
    const actingCombos = isP1Acting ? heroCombos : villainCombos;
    const actingReach = isP1Acting ? reachP1 : reachP2;
    const numActions = node.actions.length;

    const strategy = actingCombos.map((_, c) => regretMatchingStrategy(data.regret[c], numActions));

    const childResults = node.actions.map((edge, a) => {
      const childReachP1 = isP1Acting ? reachP1.map((r, c) => r * strategy[c][a]) : reachP1;
      const childReachP2 = isP1Acting ? reachP2 : reachP2.map((r, c) => r * strategy[c][a]);
      return traverse(edge.child, childReachP1, childReachP2, positiveDiscount, negativeDiscount, stratWeight);
    });

    // Acting player's utility per their own combo, under their own (per-combo) strategy.
    const actingUtil = actingCombos.map((_, c) => {
      let v = 0;
      for (let a = 0; a < numActions; a++) {
        v += strategy[c][a] * (isP1Acting ? childResults[a].utilP1[c] : childResults[a].utilP2[c]);
      }
      return v;
    });

    // Non-acting player's utility uses the acting player's RANGE-AVERAGE action
    // probabilities (the non-actor can't see the actor's specific combo).
    const totalActingReach = actingReach.reduce((s, r) => s + r, 0);
    const avgActionProb = new Array(numActions).fill(1 / numActions);
    if (totalActingReach > 0) {
      for (let a = 0; a < numActions; a++) {
        let weighted = 0;
        for (let c = 0; c < actingCombos.length; c++) weighted += actingReach[c] * strategy[c][a];
        avgActionProb[a] = weighted / totalActingReach;
      }
    }
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
    traverse(tree, initialReachP1, initialReachP2, positiveDiscount, DCFR_NEGATIVE_REGRET_DISCOUNT, stratWeight);

    if (targetExploitabilityPercent !== undefined && t >= nextCheck) {
      const snapshot: CfrSolution = { iterations: t, getAverageStrategy };
      const { percentOfPot } = computeExploitability(
        tree,
        snapshot,
        heroRange,
        villainRange,
        equityTable,
        tree.state.startPot,
      );
      nextCheck = t + Math.min(nextCheck, EXPLOITABILITY_CHECK_INTERVAL_CEILING);
      onProgress?.(t, maxIterations, percentOfPot);
      if (percentOfPot <= targetExploitabilityPercent) {
        return { iterations: t, getAverageStrategy };
      }
      continue;
    }

    if (onProgress && (t % progressInterval === 0 || t === maxIterations)) onProgress(t, maxIterations);
  }

  return { iterations: maxIterations, getAverageStrategy };
}
