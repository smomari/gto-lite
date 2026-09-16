import type { ComboRange } from "./types";
import type { EquityTable } from "./terminalEquity";
import { equityVsRange } from "./terminalEquity";
import { totalPot } from "./potState";
import type { PostflopTreeNode } from "./treeBuilder";
import type { CfrSolution } from "./cfr";

export interface CheckdownEquitySummary {
  heroEquityPercent: number;
  villainEquityPercent: number;
  heroEvBb: number;
  villainEvBb: number;
}

function weightedAverage(values: number[], weights: number[]): number {
  let weighted = 0;
  let totalWeight = 0;
  for (let i = 0; i < values.length; i++) {
    weighted += values[i] * weights[i];
    totalWeight += weights[i];
  }
  return totalWeight > 0 ? weighted / totalWeight : 0;
}

/**
 * Walks a solved tree once, propagating both players' reach through their
 * own equilibrium average strategy (mirrors cfr.ts's traverse() reach
 * propagation, but uses the already-converged average strategy throughout
 * instead of a live per-iteration regret-matching strategy), and records
 * each terminal-showdown node's range-weighted average equity/EV — "the
 * value if this exact line is checked down to showdown with no further
 * betting." The equity table already has this baked in per-combo (built via
 * comboVsComboRunoutEquity, which averages over every remaining-card
 * completion); this pass just surfaces a range-weighted summary of it per
 * node instead of leaving it buried inside CFR's internal bookkeeping.
 */
export function computeCheckdownEquities(
  tree: PostflopTreeNode,
  solution: CfrSolution,
  heroRange: ComboRange,
  villainRange: ComboRange,
  equityTable: EquityTable,
): Map<PostflopTreeNode, CheckdownEquitySummary> {
  const heroCombos = heroRange.map((c) => c.cards);
  const villainCombos = villainRange.map((c) => c.cards);
  const summaries = new Map<PostflopTreeNode, CheckdownEquitySummary>();

  function walk(node: PostflopTreeNode, reachP1: number[], reachP2: number[]): void {
    if (node.type === "terminal-fold") return; // never reaches showdown

    if (node.type === "terminal-showdown") {
      const pot = totalPot(node.state);
      const heroEquities = heroCombos.map((_, i) => equityVsRange(equityTable, "P1", i, reachP2));
      const villainEquities = villainCombos.map((_, i) => equityVsRange(equityTable, "P2", i, reachP1));

      const heroEquity = weightedAverage(heroEquities, reachP1);
      const villainEquity = weightedAverage(villainEquities, reachP2);

      summaries.set(node, {
        heroEquityPercent: heroEquity * 100,
        villainEquityPercent: villainEquity * 100,
        heroEvBb: heroEquity * pot - node.state.committed.P1,
        villainEvBb: villainEquity * pot - node.state.committed.P2,
      });
      return;
    }

    // Decision node: only the acting player's reach narrows here, mirroring
    // cfr.ts's traverse() child-reach construction exactly.
    const isP1Acting = node.actor === "P1";
    const strategy = solution.getAverageStrategy(node);

    node.actions.forEach((edge, a) => {
      const childReachP1 = isP1Acting ? reachP1.map((r, c) => r * strategy[c][a]) : reachP1;
      const childReachP2 = isP1Acting ? reachP2 : reachP2.map((r, c) => r * strategy[c][a]);
      walk(edge.child, childReachP1, childReachP2);
    });
  }

  walk(
    tree,
    heroRange.map((c) => c.weight),
    villainRange.map((c) => c.weight),
  );
  return summaries;
}
