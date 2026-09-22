import { HAND_MATRIX } from "@/lib/handRange/matrix";
import { canonicalHandOf } from "@/lib/postflopSolver/canonicalHand";
import type { SerializedCombo, SerializedDecisionNode } from "@/types/postflopSolver";
import { PostflopHandCell } from "./PostflopHandCell";

interface PostflopRangeGridProps {
  /** The acting player's range — must be the range for whichever player `node.actor` is. */
  range: SerializedCombo[];
  node: SerializedDecisionNode;
  /** Colors per action instance, index-aligned to `node.actions` (see `buildActionColorScale`). */
  colors: string[];
  /** When set, every cell shows only this action's frequency instead of the blended mix. */
  isolatedActionIndex: number | null;
  selectedHand: string | null;
  onSelectHand: (hand: string | null) => void;
}

interface HandAggregate {
  totalWeight: number;
  /** Index-aligned to `node.actions` — NOT keyed by action type, so distinct bet/raise sizes never merge into one bucket. */
  actionWeights: number[];
}

/**
 * Aggregates per-combo strategy (which genuinely varies combo-by-combo due to
 * board card removal) into a weighted average per 169-canonical hand, so the
 * flop grid reads the same way the preflop grid does. The combo-level detail
 * this collapses is still available via each cell's tooltip, and per-suit
 * detail via SuitedComboBreakdown.
 */
export function PostflopRangeGrid({ range, node, colors, isolatedActionIndex, selectedHand, onSelectHand }: PostflopRangeGridProps) {
  const byHand = new Map<string, HandAggregate>();

  range.forEach((combo, i) => {
    if (combo.weight <= 0) return;
    const label = canonicalHandOf(combo.cards);
    const strategy = node.strategy[i];
    const agg = byHand.get(label) ?? { totalWeight: 0, actionWeights: new Array(node.actions.length).fill(0) };
    agg.totalWeight += combo.weight;
    node.actions.forEach((_, actionIdx) => {
      agg.actionWeights[actionIdx] += strategy[actionIdx] * combo.weight;
    });
    byHand.set(label, agg);
  });

  const actionLabels = node.actions.map((a) => a.label);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div
        className="grid flex-1 min-h-0 gap-[2px]"
        style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))", gridTemplateRows: "repeat(13, minmax(0, 1fr))" }}
      >
        {HAND_MATRIX.flatMap((row, i) =>
          row.map((hand, j) => {
            const agg = byHand.get(hand);
            const inRange = !!agg && agg.totalWeight > 0;
            const actionFrequencies =
              agg && agg.totalWeight > 0
                ? agg.actionWeights.map((w) => w / agg.totalWeight)
                : new Array(node.actions.length).fill(0);
            return (
              <PostflopHandCell
                key={`${i}-${j}`}
                hand={hand}
                actionFrequencies={actionFrequencies}
                actionLabels={actionLabels}
                colors={colors}
                inRange={inRange}
                isolatedActionIndex={isolatedActionIndex}
                isSelected={selectedHand === hand}
                onClick={() => onSelectHand(selectedHand === hand ? null : hand)}
              />
            );
          }),
        )}
      </div>
      <div className="flex flex-wrap gap-4 text-sm text-zinc-700 dark:text-zinc-300">
        {node.actions.map((a, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: colors[i] }} />
            <span>{a.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
