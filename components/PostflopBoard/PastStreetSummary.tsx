import { CardChip } from "./CardChip";

interface PastStreetSummaryProps {
  streetLabel: "Flop" | "Turn" | "River";
  board: string[];
  potBb: number;
  actionLabels: string[];
  expanded: boolean;
  onToggleExpand: () => void;
  /** The stage's full content (action bar, checkdown note, precise EV, reset links) — only rendered by the caller while `expanded`, so it doesn't mount at all while collapsed. */
  children?: React.ReactNode;
}

/**
 * A street that's already fully resolved (per PostflopPanel's own invariant,
 * every street except the last one always is) collapses to this compact
 * one-line pill by default — board + how the action went + pot — so it
 * doesn't keep pushing the live street's grid further down the page.
 * Clicking it reveals the exact same content it always had; nothing is
 * dropped, just lazily mounted.
 */
export function PastStreetSummary({
  streetLabel,
  board,
  potBb,
  actionLabels,
  expanded,
  onToggleExpand,
  children,
}: PastStreetSummaryProps) {
  return (
    <div
      data-testid="street-stage"
      data-street={streetLabel}
      className="flex flex-col gap-2 border-t border-zinc-200 pt-3 first:border-t-0 first:pt-0 dark:border-zinc-800"
    >
      <button type="button" onClick={onToggleExpand} className="flex flex-wrap items-center gap-2 text-left">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{streetLabel}</h3>
        <div className="flex gap-0.5">
          {board.map((card) => (
            <CardChip key={card} card={card} size="sm" />
          ))}
        </div>
        {actionLabels.length > 0 && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">{actionLabels.join(" → ")}</span>
        )}
        <span className="text-xs text-zinc-500 dark:text-zinc-400">pot {potBb.toFixed(1)}bb</span>
        <span className="ml-auto text-xs text-zinc-400 underline dark:text-zinc-600">
          {expanded ? "Hide details ▲" : "Details ▾"}
        </span>
      </button>
      {expanded && children}
    </div>
  );
}
