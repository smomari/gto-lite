import type { ComboRange } from "./types";
import type { EquityTable } from "./terminalEquity";
import { equityVsRange } from "./terminalEquity";
import { totalPot } from "./potState";
import type { DecisionNode, PostflopTreeNode } from "./treeBuilder";

interface CfrNodeData {
  /** [comboIndex][actionIndex], CFR+ regret (floored at 0 after every update). */
  regret: number[][];
  /** [comboIndex][actionIndex], iteration-weighted accumulation for the averaged (equilibrium) strategy. */
  stratSum: number[][];
}

export interface CfrSolution {
  iterations: number;
  /** [comboIndex][actionIndex], normalized. `combos`/`actionLabels` on the node itself give you what each index means. */
  getAverageStrategy(node: DecisionNode): number[][];
}

/**
 * Range-vector CFR+: instead of one regret table per literal information-set
 * string, hero's and villain's entire ranges are tracked as reach-probability
 * arrays threaded through the tree (parallel to `heroCombos`/`villainCombos`),
 * so one traversal updates every combo's strategy at once. See the plan doc
 * for the algorithm's derivation; this is the concrete implementation of it.
 */
export function runCfr(
  tree: PostflopTreeNode,
  heroRange: ComboRange,
  villainRange: ComboRange,
  equityTable: EquityTable,
  iterations: number,
  onProgress?: (done: number, total: number) => void,
): CfrSolution {
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
    iteration: number,
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
      return traverse(edge.child, childReachP1, childReachP2, iteration);
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

    // CFR+ regret update (floored at 0) + linearly-weighted average-strategy accumulation.
    for (let c = 0; c < actingCombos.length; c++) {
      for (let a = 0; a < numActions; a++) {
        const actionUtil = isP1Acting ? childResults[a].utilP1[c] : childResults[a].utilP2[c];
        const regretDelta = actionUtil - actingUtil[c];
        data.regret[c][a] = Math.max(0, data.regret[c][a] + regretDelta);
        data.stratSum[c][a] += iteration * actingReach[c] * strategy[c][a];
      }
    }

    return isP1Acting
      ? { utilP1: actingUtil, utilP2: nonActingUtil }
      : { utilP1: nonActingUtil, utilP2: actingUtil };
  }

  const progressInterval = Math.max(1, Math.floor(iterations / 50));
  for (let t = 1; t <= iterations; t++) {
    traverse(tree, initialReachP1, initialReachP2, t);
    if (onProgress && (t % progressInterval === 0 || t === iterations)) onProgress(t, iterations);
  }

  return {
    iterations,
    getAverageStrategy(node: DecisionNode): number[][] {
      const data = cfrData.get(node);
      if (!data) throw new Error("getAverageStrategy: node was not part of the solved tree");
      return data.stratSum.map((row) => {
        const sum = row.reduce((s, x) => s + x, 0);
        if (sum <= 0) return row.map(() => 1 / row.length);
        return row.map((x) => x / sum);
      });
    },
  };
}
