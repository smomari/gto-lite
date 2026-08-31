import { RANKS, type Rank } from "@/lib/handRange/handList";

/** Maps a concrete combo's two cards to its 169-canonical-hand label, e.g. ["As","6s"] -> "A6s". */
export function canonicalHandOf(cards: [string, string]): string {
  const [r1, s1] = [cards[0][0] as Rank, cards[0][1]];
  const [r2, s2] = [cards[1][0] as Rank, cards[1][1]];

  if (r1 === r2) return `${r1}${r2}`;

  const [hi, lo] = RANKS.indexOf(r1) < RANKS.indexOf(r2) ? [r1, r2] : [r2, r1];
  return `${hi}${lo}${s1 === s2 ? "s" : "o"}`;
}
