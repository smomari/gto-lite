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
      className={`flex shrink-0 flex-col gap-1 rounded-md p-2 text-left disabled:cursor-default ${
        isLive ? "" : selected ? "bg-raised" : "opacity-70 hover:opacity-100"
      }`}
    >
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="font-semibold text-ink">{streetLabel}</span>
        <span className="font-mono tabular-nums text-ink-faint">pot {potBb.toFixed(1)}bb</span>
      </div>
      <div className="flex gap-0.5">
        {cards.map((card) => (
          <CardChip key={card} card={card} size="sm" />
        ))}
      </div>
    </button>
  );
}
