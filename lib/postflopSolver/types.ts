import type { Rank } from "@/lib/handRange/handList";
import type { Suit } from "@/lib/equity/assignCards";

/** A concrete two-card hole-card combo, e.g. cards ["Ah", "Kd"]. */
export interface Combo {
  cards: [string, string];
  /** Combo-weighted probability mass carried over from the preceding street/range, 0..1-ish (not normalized to 1). */
  weight: number;
}

/** A player's range at the start of a street: weighted concrete combos, board-blocked combos already removed. */
export type ComboRange = Combo[];

/** 3 (flop), 4 (turn), or 5 (river) board cards, e.g. ["Ah","Kd","2c"]. */
export type BoardCards = string[];

export type { Rank, Suit };
