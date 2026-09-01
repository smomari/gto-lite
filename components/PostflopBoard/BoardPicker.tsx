"use client";

import { useState } from "react";

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
      <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}>
        {RANKS.flatMap((rank) =>
          SUITS.map((suit) => {
            const card = `${rank}${suit}`;
            const isExcluded = excluded.has(card);
            const isSelected = selected.includes(card);
            return (
              <button
                key={card}
                type="button"
                disabled={isExcluded || (!isSelected && selected.length >= count)}
                onClick={() => toggleCard(card)}
                className={`rounded px-1 py-1.5 text-xs font-medium disabled:opacity-30 ${
                  isExcluded
                    ? "bg-zinc-300 dark:bg-zinc-900"
                    : isSelected
                      ? "bg-emerald-500 text-white"
                      : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                }`}
              >
                {card}
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
