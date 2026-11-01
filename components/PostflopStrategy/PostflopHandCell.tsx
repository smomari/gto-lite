import { formatPercent } from "@/lib/format";
import { readableTextColor } from "./postflopColorLegend";

interface PostflopHandCellProps {
  hand: string;
  /** Average strategy for this hand at this node, index-aligned to the node's actions (not keyed by action type — two "bet" entries at different sizes get separate slots). */
  actionFrequencies: number[];
  /** Action labels, index-aligned to actionFrequencies (e.g. "Bet 5.0bb") — used for the tooltip so distinct bet/raise sizes get distinct lines instead of merging. */
  actionLabels: string[];
  /** Colors per action instance, index-aligned to actionFrequencies. */
  colors: string[];
  /** False when this hand carries no weight in the acting player's range here (folded earlier, or fully board-blocked). */
  inRange: boolean;
  /** When set, the cell shows a single solid fill for only this action's frequency instead of the blended stacked bar. */
  isolatedActionIndex: number | null;
  isSelected: boolean;
  onClick: () => void;
}

export function PostflopHandCell({
  hand,
  actionFrequencies,
  actionLabels,
  colors,
  inRange,
  isolatedActionIndex,
  isSelected,
  onClick,
}: PostflopHandCellProps) {
  // actionFrequencies/actionLabels/colors come in least-aggressive-first
  // order (fold, check, call, bet(s), raise(s), allin — treeBuilder.ts's
  // push order); reversed so the most aggressive action's segment renders
  // first, matching the preflop grid.
  const segments = actionFrequencies
    .map((value, i) => ({ label: actionLabels[i], value, color: colors[i] }))
    .filter((s) => s.value > 0)
    .reverse();

  const tooltipLines = actionFrequencies
    .map((v, i) => (v > 0 ? `${actionLabels[i]} ${formatPercent(v)}` : null))
    .filter((line): line is string => line !== null);
  const tooltip = inRange ? [hand, ...tooltipLines].join("\n") : `${hand}\nNot in range`;

  // The label sits on whichever action fills most of the cell, unless one is isolated (a faint fill on the dark cell).
  const dominantColor = segments.reduce((a, b) => (b.value > a.value ? b : a), { value: 0, color: "#1a1e24", label: "" }).color;
  const labelColor = isolatedActionIndex !== null ? "#f9fafb" : readableTextColor(dominantColor);

  const isolatedColor = isolatedActionIndex !== null ? colors[isolatedActionIndex] : null;
  const isolatedValue = isolatedActionIndex !== null ? (actionFrequencies[isolatedActionIndex] ?? 0) : null;

  return (
    <button
      type="button"
      disabled={!inRange}
      onClick={onClick}
      className={`relative block h-full w-full overflow-hidden rounded-[2px] disabled:cursor-default ${inRange ? "bg-raised" : "bg-sunken"} ${
        isSelected ? "ring-[1.5px] ring-accent" : ""
      }`}
      title={tooltip}
      data-hand={hand}
      data-testid="postflop-hand-cell"
    >
      <div className="flex h-full w-full">
        {inRange &&
          isolatedColor === null &&
          segments.map((s) => <div key={s.label} style={{ flex: `${s.value} 0 0`, backgroundColor: s.color }} />)}
        {inRange && isolatedColor !== null && (
          <div
            className="absolute inset-0"
            data-testid="postflop-hand-cell-isolated-fill"
            style={{ backgroundColor: isolatedColor, opacity: Math.max(isolatedValue ?? 0, 0.08) }}
          />
        )}
      </div>
      <span
        className={`pointer-events-none absolute inset-0 flex items-center justify-center text-[9px] font-medium sm:text-[10px] ${inRange ? "" : "text-ink-faint"}`}
        style={inRange ? { color: labelColor } : undefined}
      >
        {hand}
      </span>
    </button>
  );
}
