import { CardChip } from "./CardChip";
import type { StreetLabel } from "./streetLabel";

interface StreetBoxProps {
  streetLabel: StreetLabel;
  /** Only the cards this street dealt (3 for the flop, 1 for the turn/river), not the cumulative board. */
  cards: string[];
  /** Pot entering the street — the seat boxes that follow show how it grew. */
  potBb: number;
  status: "past" | "live";
  selected: boolean;
  onClick: () => void;
}

/** A street's divider in the seat-bar timeline; its seat boxes follow it, exactly like preflop's. */
export function StreetBox({ streetLabel, cards, potBb, status, selected, onClick }: StreetBoxProps) {
  const isLive = status === "live";

  return (
    <button
      type="button"
      data-testid="street-box"
      data-street={streetLabel}
      data-status={status}
      disabled={isLive}
      onClick={onClick}
      title={isLive ? undefined : "Show this street's details"}
      className={`flex shrink-0 min-w-[130px] flex-col gap-1.5 rounded-lg border p-2.5 text-left disabled:cursor-default ${
        isLive
          ? "border-emerald-500 ring-1 ring-emerald-500"
          : selected
            ? "border-zinc-400 ring-2 ring-zinc-400 dark:border-zinc-500 dark:ring-zinc-500"
            : "border-zinc-300 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500"
      }`}
    >
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-semibold uppercase text-zinc-900 dark:text-zinc-100">{streetLabel}</span>
        <span className="text-zinc-500 dark:text-zinc-400">pot {potBb.toFixed(1)}bb</span>
      </div>
      <div className="flex gap-0.5">
        {cards.map((card) => (
          <CardChip key={card} card={card} size="sm" />
        ))}
      </div>
    </button>
  );
}
