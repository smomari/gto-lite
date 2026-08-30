import { evaluateCards } from "phe";

/**
 * `phe`'s own evaluateCards uses "smaller number = stronger hand" — the
 * opposite of what most poker-tooling APIs use (including this repo's own
 * poker-evaluator-based offline equity generator, which is "bigger = better").
 * This module is the ONLY place that convention should ever be touched
 * directly; everything else in lib/postflopSolver/ uses compareHands, whose
 * sign matches ordinary comparator convention (positive = first arg wins).
 */

/** Raw phe hand-strength number for 5-7 cards. Smaller is better. Exposed only for tests pinning phe's convention. */
export function handRank(cards: string[]): number {
  return evaluateCards(cards);
}

/**
 * Compares two hands (each 5-7 cards, hole cards + board already combined).
 * Returns >0 if handA is stronger, <0 if handB is stronger, 0 if tied.
 */
export function compareHands(cardsA: string[], cardsB: string[]): number {
  return handRank(cardsB) - handRank(cardsA);
}
