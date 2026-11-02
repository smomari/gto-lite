import type { PostflopPlayer } from "./potState";
import type { SerializedCombo, SerializedDecisionNode } from "@/types/postflopSolver";

/** One step of a walked tree path: the decision node encountered, and the index (into `node.actions`) of the action actually taken. */
export interface TreePathStep {
  node: SerializedDecisionNode;
  actionIndex: number;
}

/**
 * Re-weights `range` (must be in the same combo order as the
 * `heroRange`/`villainRange` a street's solve produced, since `strategy`'s
 * comboIndex is aligned to that order) by `actor`'s reach probability of
 * having taken `path` — the product, over every step where `actor` was the
 * one acting, of that combo's probability of choosing the action taken.
 * Steps where the other player acted don't affect `actor`'s reach, mirroring
 * how cfr.ts only updates reachP1/reachP2 on the acting player's own turn.
 *
 * A combo with ~0 probability of having taken this line ends up with ~0
 * weight here, and later decisions read that the same way: a weight of 0 means
 * not in the range at this node.
 */
export function narrowRangeAlongPath(
  range: SerializedCombo[],
  actor: PostflopPlayer,
  path: TreePathStep[],
): SerializedCombo[] {
  const multiplier = range.map(() => 1);
  for (const step of path) {
    if (step.node.actor !== actor) continue;
    for (let c = 0; c < range.length; c++) {
      multiplier[c] *= step.node.strategy[c]?.[step.actionIndex] ?? 0;
    }
  }
  return range.map((combo, i) => ({ cards: combo.cards, weight: combo.weight * multiplier[i] }));
}
