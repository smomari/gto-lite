"use client";

import { useState } from "react";

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
const SUITS = ["s", "h", "d", "c"];

interface BoardPickerProps {
  onConfirm: (board: string[]) => void;
}

export function BoardPicker({ onConfirm }: BoardPickerProps) {
  const [selected, setSelected] = useState<string[]>([]);

  function toggleCard(card: string) {
    if (selected.includes(card)) {
      setSelected(selected.filter((c) => c !== card));
    } else if (selected.length < 3) {
      setSelected([...selected, card]);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">Pick the 3 flop cards ({selected.length}/3).</p>
      <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}>
        {RANKS.flatMap((rank) =>
          SUITS.map((suit) => {
            const card = `${rank}${suit}`;
            const isSelected = selected.includes(card);
            return (
              <button
                key={card}
                type="button"
                disabled={!isSelected && selected.length >= 3}
                onClick={() => toggleCard(card)}
                className={`rounded px-1 py-1.5 text-xs font-medium disabled:opacity-30 ${
                  isSelected
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
        disabled={selected.length !== 3}
        onClick={() => onConfirm(selected)}
        className="self-start rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
      >
        Solve flop
      </button>
    </div>
  );
}
