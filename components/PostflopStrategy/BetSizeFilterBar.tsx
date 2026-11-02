import { formatPercent } from "@/lib/format";
import type { SerializedCombo, SerializedDecisionNode } from "@/types/postflopSolver";

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
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-1 sm:flex">
        {node.actions.map((a, i) => {
          const isActive = isolatedActionIndex === i;
          const dimmed = isolatedActionIndex !== null && !isActive;
          return (
            <button
              key={i}
              type="button"
              aria-label={`${a.label} · ${formatPercent(frequencies[i])}`}
              aria-pressed={isActive}
              onClick={() => onIsolateChange(isActive ? null : i)}
              className={`min-w-0 flex-1 rounded-md px-2 py-1 text-left transition pointer-coarse:min-h-9 ${dimmed ? "opacity-40" : ""} ${
                isActive ? "bg-raised shadow-[inset_0_0_0_1px_var(--color-line-strong)]" : "hover:bg-surface"
              }`}
            >
              <span className="flex items-center gap-1.5 truncate text-xs text-ink-muted">
                <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: colors[i] }} />
                {a.label}
              </span>
              <span className="mt-0.5 block font-mono text-xl font-medium tabular-nums text-ink">{formatPercent(frequencies[i])}</span>
            </button>
          );
        })}
      </div>
      <div className="flex h-1 overflow-hidden rounded-[1px] bg-raised">
        {node.actions.map((a, i) =>
          frequencies[i] > 0 ? <div key={i} style={{ flex: `${frequencies[i]} 0 0`, backgroundColor: colors[i] }} /> : null,
        )}
      </div>
    </div>
  );
}
