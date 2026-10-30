import { RANKS, remainingDeck } from "@/lib/cards";

export const DEFAULT_PRECISE_SAMPLE_COUNT = 3;
export const MAX_PRECISE_SAMPLE_COUNT = 5;

/**
 * A deterministic, reproducible subset of `count` cards spread evenly
 * through the remaining deck (not a true random sample). Every card in the
 * true remaining deck is a priori equally likely — removal only depends on
 * which cards are already on the board/dealt, not on which specific hero or
 * villain hand holds a card — so callers can weight every sampled card
 * uniformly (1/count) with no further renormalization.
 */
export function sampleNextCards(usedCards: string[], count: number): string[] {
  const deck = remainingDeck(usedCards);
  if (count >= deck.length) return deck;
  const step = deck.length / count;
  return Array.from({ length: count }, (_, i) => deck[Math.floor(i * step)]);
}

/**
 * A stand-in for dealing every remaining card, for lookahead streets: `count`
 * cards, each weighted for the run of similar cards it represents (weights in
 * the same scale as treeBuilder.ts's dealEveryCard, so they sum to the same
 * total). The remaining deck is ordered so similar cards sit together —
 * flush-relevant suits first (more board cards of the suit), then cards that
 * pair the board, then by rank — and split into `count` near-equal runs, one
 * card from the middle of each. A suit that can bring a flush is never left out
 * unless it has fewer cards than a run.
 */
export function stratifiedNextCards(board: string[], count: number): { card: string; weight: number }[] {
  const baseWeight = 1 / (48 - board.length);
  const deck = remainingDeck(board);
  if (count >= deck.length) return deck.map((card) => ({ card, weight: baseWeight }));

  const suitCount = (card: string) => board.filter((b) => b[1] === card[1]).length;
  const pairsBoard = (card: string) => board.some((b) => b[0] === card[0]);
  const rankOrder = (card: string) => RANKS.indexOf(card[0] as (typeof RANKS)[number]);
  const ordered = [...deck].sort(
    (a, b) =>
      suitCount(b) - suitCount(a) ||
      Number(pairsBoard(b)) - Number(pairsBoard(a)) ||
      rankOrder(a) - rankOrder(b) ||
      a[1].localeCompare(b[1]),
  );

  return Array.from({ length: count }, (_, k) => {
    const start = Math.round((k * ordered.length) / count);
    const end = Math.round(((k + 1) * ordered.length) / count);
    return { card: ordered[Math.floor((start + end) / 2)], weight: (end - start) * baseWeight };
  });
}
