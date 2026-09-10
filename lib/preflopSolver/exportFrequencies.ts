import type { HandFrequency } from "@/types/rangeData";
import type { DecisionNode } from "@/lib/postflopSolver/treeBuilder";
import type { ComboRange } from "@/lib/postflopSolver/types";
import type { CfrSolution } from "@/lib/postflopSolver/cfr";
import { canonicalHandOf } from "@/lib/postflopSolver/canonicalHand";

/**
 * Extracts the opener's root-node average strategy as a 169-hand
 * HandFrequency[] — the same shape generateOpeningScenario produces, so it
 * slots into solveActiveSeat's existing SolvedNode.hands contract unchanged.
 * heroRange must be canonicalRfiRange's output (one slot per ALL_HANDS
 * entry, same order) so combo index == hand index, needing no
 * grouping/averaging.
 */
export function extractOpenerRootFrequencies(
  root: DecisionNode,
  solution: CfrSolution,
  heroRange: ComboRange,
): HandFrequency[] {
  const avgStrategy = solution.getAverageStrategy(root);
  const raiseIdx = root.actions.findIndex((a) => a.action === "raise");
  return heroRange.map((combo, i) => ({
    hand: canonicalHandOf(combo.cards),
    fold: 1 - avgStrategy[i][raiseIdx],
    call: 0,
    raise: avgStrategy[i][raiseIdx],
  }));
}
