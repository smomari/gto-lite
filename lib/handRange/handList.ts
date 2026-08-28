export const RANKS = [
  "A",
  "K",
  "Q",
  "J",
  "T",
  "9",
  "8",
  "7",
  "6",
  "5",
  "4",
  "3",
  "2",
] as const;

export type Rank = (typeof RANKS)[number];
export type HandType = "pair" | "suited" | "offsuit";

export interface CanonicalHand {
  hand: string;
  rankHigh: Rank;
  rankLow: Rank;
  type: HandType;
  combos: number;
}

function comboCountFor(type: HandType): number {
  if (type === "pair") return 6;
  if (type === "suited") return 4;
  return 12;
}

/**
 * All 169 canonical starting hands, ordered by descending rank (AA first, 72o last).
 * Combo counts sum to 1326 = C(52,2).
 */
export const ALL_HANDS: CanonicalHand[] = (() => {
  const hands: CanonicalHand[] = [];
  for (let i = 0; i < RANKS.length; i++) {
    for (let j = 0; j < RANKS.length; j++) {
      if (i === j) {
        const type: HandType = "pair";
        hands.push({
          hand: `${RANKS[i]}${RANKS[i]}`,
          rankHigh: RANKS[i],
          rankLow: RANKS[i],
          type,
          combos: comboCountFor(type),
        });
      } else if (i < j) {
        const type: HandType = "suited";
        hands.push({
          hand: `${RANKS[i]}${RANKS[j]}s`,
          rankHigh: RANKS[i],
          rankLow: RANKS[j],
          type,
          combos: comboCountFor(type),
        });
      }
    }
  }
  for (let i = 0; i < RANKS.length; i++) {
    for (let j = 0; j < RANKS.length; j++) {
      if (i > j) {
        const type: HandType = "offsuit";
        hands.push({
          hand: `${RANKS[j]}${RANKS[i]}o`,
          rankHigh: RANKS[j],
          rankLow: RANKS[i],
          type,
          combos: comboCountFor(type),
        });
      }
    }
  }
  return hands;
})();

export const HAND_BY_LABEL: ReadonlyMap<string, CanonicalHand> = new Map(
  ALL_HANDS.map((h) => [h.hand, h]),
);

export function getCombos(hand: string): number {
  const found = HAND_BY_LABEL.get(hand);
  if (!found) throw new Error(`Unknown hand label: ${hand}`);
  return found.combos;
}
