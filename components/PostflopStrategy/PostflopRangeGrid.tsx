import { HAND_MATRIX } from "@/lib/handRange/matrix";
import { canonicalHandOf } from "@/lib/postflopSolver/canonicalHand";
import type { PostflopActionType } from "@/lib/postflopSolver/potState";
import type { SerializedCombo, SerializedDecisionNode } from "@/types/postflopSolver";
import { PostflopHandCell } from "./PostflopHandCell";
import { POSTFLOP_ACTION_COLORS, POSTFLOP_ACTION_ORDER } from "./postflopColorLegend";

interface PostflopRangeGridProps {
  /** The acting player's range — must be the range for whichever player `node.actor` is. */
  range: SerializedCombo[];
  node: SerializedDecisionNode;
}

interface HandAggregate {
  totalWeight: number;
  actionWeights: Partial<Record<PostflopActionType, number>>;
}

/**
 * Aggregates per-combo strategy (which genuinely varies combo-by-combo due to
 * board card removal) into a weighted average per 169-canonical hand, so the
 * flop grid reads the same way the preflop grid does. The combo-level detail
 * this collapses is still available via each cell's tooltip.
 */
export function PostflopRangeGrid({ range, node }: PostflopRangeGridProps) {
  const byHand = new Map<string, HandAggregate>();

  range.forEach((combo, i) => {
    if (combo.weight <= 0) return;
    const label = canonicalHandOf(combo.cards);
    const strategy = node.strategy[i];
    const agg = byHand.get(label) ?? { totalWeight: 0, actionWeights: {} };
    agg.totalWeight += combo.weight;
    node.actions.forEach((a, actionIdx) => {
      agg.actionWeights[a.action] = (agg.actionWeights[a.action] ?? 0) + strategy[actionIdx] * combo.weight;
    });
    byHand.set(label, agg);
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-[2px]" style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}>
        {HAND_MATRIX.flatMap((row, i) =>
          row.map((hand, j) => {
            const agg = byHand.get(hand);
            const actionFrequencies: Partial<Record<PostflopActionType, number>> = {};
            if (agg && agg.totalWeight > 0) {
              for (const action of POSTFLOP_ACTION_ORDER) {
                const w = agg.actionWeights[action];
                if (w) actionFrequencies[action] = w / agg.totalWeight;
              }
            }
            return (
              <PostflopHandCell
                key={`${i}-${j}`}
                hand={hand}
                actionFrequencies={actionFrequencies}
                inRange={!!agg && agg.totalWeight > 0}
              />
            );
          }),
        )}
      </div>
      <div className="flex flex-wrap gap-4 text-sm text-zinc-700 dark:text-zinc-300">
        {node.actions.map((a) => (
          <div key={a.action} className="flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-3 rounded-sm"
              style={{ backgroundColor: POSTFLOP_ACTION_COLORS[a.action] }}
            />
            <span>{a.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
