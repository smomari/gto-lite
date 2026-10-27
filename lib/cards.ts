export const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"] as const;
export type Rank = (typeof RANKS)[number];

export type Suit = "s" | "h" | "d" | "c";
export const SUITS: Suit[] = ["s", "h", "d", "c"];

/** Rank-major, highest first — CARD_INDEX-style lookups elsewhere depend on this order staying stable. */
export const FULL_DECK: string[] = RANKS.flatMap((r) => SUITS.map((s) => `${r}${s}`));

export function remainingDeck(used: string[]): string[] {
  const usedSet = new Set(used);
  return FULL_DECK.filter((c) => !usedSet.has(c));
}

/** Order-independent identity for a physical 2-card combo, e.g. ["Kc","Ac"] and ["Ac","Kc"] both key to "AcKc". */
export function comboKey(cards: [string, string]): string {
  return [...cards].sort().join("");
}
