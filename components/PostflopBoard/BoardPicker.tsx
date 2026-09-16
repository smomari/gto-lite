"use client";

import { useState } from "react";
import { CardChip } from "./CardChip";

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
const SUITS = ["s", "h", "d", "c"];

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
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        {title} ({selected.length}/{count}).
      </p>

      <div data-testid="card-preview-strip" className="flex gap-1.5">
        {Array.from({ length: count }, (_, i) => (
          <CardChip key={i} card={selected[i]} size="md" />
        ))}
      </div>

      {/* One row per suit (suit-outer, rank-inner) so same-suit cards line up, unlike an alphabetical rank-major list. */}
      <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}>
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
                className={`rounded p-0.5 transition disabled:opacity-30 ${
                  isSelected ? "ring-2 ring-emerald-500" : ""
                } ${isExcluded ? "grayscale" : "hover:brightness-95 dark:hover:brightness-125"}`}
              >
                <CardChip card={card} size="sm" />
              </button>
            );
          }),
        )}
      </div>

      <button
        type="button"
        disabled={selected.length !== count}
        onClick={() => onConfirm(selected)}
        className="self-start rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
      >
        {confirmLabel}
      </button>
    </div>
  );
}
