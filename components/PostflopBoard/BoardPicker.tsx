"use client";

import { useState } from "react";
import { RANKS, SUITS } from "@/lib/cards";
import { CardChip } from "./CardChip";

interface BoardPickerProps {
  /** How many cards the caller needs picked (3 for the flop, 1 for the turn). */
  count: number;
  /** Cards already on the board from a prior street — greyed out and unclickable. */
  excludedCards?: string[];
  title: string;
  confirmLabel: string;
  onConfirm: (cards: string[]) => void;
}

export function BoardPicker({ count, excludedCards = [], title, confirmLabel, onConfirm }: BoardPickerProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const excluded = new Set(excludedCards);

  function toggleCard(card: string) {
    if (excluded.has(card)) return;
    if (selected.includes(card)) {
      setSelected(selected.filter((c) => c !== card));
    } else if (selected.length < count) {
      setSelected([...selected, card]);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-muted">
        {title} ({selected.length}/{count}).
      </p>

      <div data-testid="card-preview-strip" className="flex gap-1.5">
        {Array.from({ length: count }, (_, i) => (
          <CardChip key={i} card={selected[i]} size="md" />
        ))}
      </div>

      {/* One row per suit (suit-outer, rank-inner) so same-suit cards line up, unlike an alphabetical rank-major list. */}
      <div className="grid gap-px sm:gap-1 lg:max-w-[480px]" style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}>
        {SUITS.flatMap((suit) =>
          RANKS.map((rank) => {
            const card = `${rank}${suit}`;
            const isExcluded = excluded.has(card);
            const isSelected = selected.includes(card);
            return (
              <button
                key={card}
                type="button"
                aria-label={card}
                disabled={isExcluded || (!isSelected && selected.length >= count)}
                onClick={() => toggleCard(card)}
                className={`rounded p-px transition disabled:opacity-30 sm:p-0.5 ${
                  isSelected ? "ring-[1.5px] ring-accent" : ""
                } ${isExcluded ? "grayscale" : "hover:brightness-125"}`}
              >
                <CardChip card={card} size="fluid" />
              </button>
            );
          }),
        )}
      </div>

      <button
        type="button"
        disabled={selected.length !== count}
        onClick={() => onConfirm(selected)}
        className="self-start rounded bg-accent px-3 py-1.5 text-sm font-medium text-canvas disabled:opacity-40 pointer-coarse:min-h-11"
      >
        {confirmLabel}
      </button>
    </div>
  );
}
