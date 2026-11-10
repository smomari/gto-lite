import { remainingDeck } from "@/lib/cards";
import { handRank } from "@/lib/postflopSolver/handEval";
import type { SerializedCombo } from "@/types/postflopSolver";

export const STRENGTH_BUCKETS = ["nuts", "strong", "medium", "draw", "air"] as const;
export type StrengthBucket = (typeof STRENGTH_BUCKETS)[number];

/** Lower edges of each made-hand bucket, as showdown equity against the opponent's range on the board as it stands. */
const NUTS_MIN_EQUITY = 0.9;
const STRONG_MIN_EQUITY = 0.7;
const MEDIUM_MIN_EQUITY = 0.45;
/** A weaker hand counts as a draw with this many next cards that make it strong (a flush draw has 9, an open-ender 8). */
const DRAW_MIN_OUTS = 8;

/** The opponent's hand ranks on a board, strongest first, with the weight at or above each. */
interface OpponentRanks {
  ranks: number[];
  weightBefore: number[];
  total: number;
}

function opponentRanks(board: string[], opponent: SerializedCombo[]): OpponentRanks {
  const dealt = new Set(board);
  const ranked = opponent
    .filter((c) => c.weight > 0 && !dealt.has(c.cards[0]) && !dealt.has(c.cards[1]))
    .map((c) => ({ rank: handRank([...c.cards, ...board]), weight: c.weight }))
    .sort((a, b) => a.rank - b.rank);
  const weightBefore = [0];
  for (const { weight } of ranked) weightBefore.push(weightBefore[weightBefore.length - 1] + weight);
  return { ranks: ranked.map((r) => r.rank), weightBefore, total: weightBefore[ranked.length] };
}

/** First index whose rank is at least `rank`, or above it when `after`. */
function firstIndex(ranks: number[], rank: number, after: boolean): number {
  let lo = 0;
  let hi = ranks.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ranks[mid] < rank || (after && ranks[mid] === rank)) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Showdown equity of a hand of phe rank `rank` against `opponent`: the share it beats, ties counted half. */
function equityAgainst(opponent: OpponentRanks, rank: number): number {
  if (opponent.total <= 0) return 0.5;
  // phe ranks: smaller is stronger, so the opponent's hands before `rank` beat it.
  const stronger = opponent.weightBefore[firstIndex(opponent.ranks, rank, false)];
  const tied = opponent.weightBefore[firstIndex(opponent.ranks, rank, true)] - stronger;
  return (opponent.total - stronger - tied / 2) / opponent.total;
}

/**
 * Sorts each combo into a strength bucket by its showdown equity against
 * `opponent` on `board` as it stands, the way solvers bucket hands. Before
 * the river a hand below medium is a draw if enough next cards make it
 * strong. Card removal between the two hands is ignored. Combos with no
 * weight get no bucket.
 */
export function strengthBuckets(board: string[], combos: SerializedCombo[], opponent: SerializedCombo[]): (StrengthBucket | null)[] {
  const now = opponentRanks(board, opponent);
  const nextByCard = new Map<string, OpponentRanks>();
  const next = (card: string) => {
    let ranks = nextByCard.get(card);
    if (!ranks) {
      ranks = opponentRanks([...board, card], opponent);
      nextByCard.set(card, ranks);
    }
    return ranks;
  };

  return combos.map(({ cards, weight }) => {
    if (weight <= 0) return null;
    const equity = equityAgainst(now, handRank([...cards, ...board]));
    if (equity >= NUTS_MIN_EQUITY) return "nuts";
    if (equity >= STRONG_MIN_EQUITY) return "strong";
    if (equity >= MEDIUM_MIN_EQUITY) return "medium";
    if (board.length >= 5) return "air";
    const outs = remainingDeck([...board, ...cards]).filter(
      (card) => equityAgainst(next(card), handRank([...cards, ...board, card])) >= STRONG_MIN_EQUITY,
    ).length;
    return outs >= DRAW_MIN_OUTS ? "draw" : "air";
  });
}
