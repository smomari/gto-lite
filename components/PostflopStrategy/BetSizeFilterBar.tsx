import type { SerializedCombo, SerializedDecisionNode } from "@/types/postflopSolver";
import { readableTextColor } from "./postflopColorLegend";

interface BetSizeFilterBarProps {
  node: SerializedDecisionNode;
  range: SerializedCombo[];
  /** Colors per action instance, index-aligned to `node.actions` (see `buildActionColorScale`). */
  colors: string[];
  isolatedActionIndex: number | null;
  onIsolateChange: (index: number | null) => void;
}

/** Range-weighted average frequency for each action, index-aligned to `node.actions`. */
function actionFrequencies(node: SerializedDecisionNode, range: SerializedCombo[]): number[] {
  const totalWeight = range.reduce((sum, c) => (c.weight > 0 ? sum + c.weight : sum), 0);
  return node.actions.map((_, actionIdx) => {
    if (totalWeight <= 0) return 0;
    const weighted = range.reduce(
      (sum, c, i) => (c.weight > 0 ? sum + c.weight * node.strategy[i][actionIdx] : sum),
      0,
    );
    return weighted / totalWeight;
  });
}

/**
 * One colored button per action available at the current node, showing its
 * range-weighted frequency — click to isolate the range grid to just that
 * action (click again to return to the blended view).
 */
export function BetSizeFilterBar({ node, range, colors, isolatedActionIndex, onIsolateChange }: BetSizeFilterBarProps) {
  const frequencies = actionFrequencies(node, range);

  return (
    <div className="flex flex-wrap gap-2">
      {node.actions.map((a, i) => {
        const isActive = isolatedActionIndex === i;
        const dimmed = isolatedActionIndex !== null && !isActive;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onIsolateChange(isActive ? null : i)}
            className={`rounded px-3 py-1.5 text-sm font-medium transition ${dimmed ? "opacity-40" : ""} ${
              isActive ? "ring-2 ring-emerald-500 ring-offset-1" : ""
            }`}
            style={{ backgroundColor: colors[i], color: readableTextColor(colors[i]) }}
          >
            {a.label} · {(frequencies[i] * 100).toFixed(1)}%
          </button>
        );
      })}
    </div>
  );
}
