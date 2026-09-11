import { remainingDeck } from "./terminalEquity";

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
