import { HandMatrixGrid } from "@/components/RangeGrid/HandMatrixGrid";
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
  const legend = node.actions.map((a, i) => ({ key: String(i), label: a.label, color: colors[i] }));

  return (
    <HandMatrixGrid
      legend={legend}
      renderCell={(hand) => {
        const agg = byHand.get(hand);
        const inRange = !!agg && agg.totalWeight > 0;
        const actionFrequencies = inRange
          ? agg.actionWeights.map((w) => w / agg.totalWeight)
          : new Array(node.actions.length).fill(0);
        return (
          <PostflopHandCell
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
      }}
    />
  );
}
