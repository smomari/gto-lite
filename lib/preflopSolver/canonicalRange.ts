import { ALL_HANDS, type CanonicalHand } from "@/lib/handRange/handList";
import { SUITS } from "@/lib/equity/assignCards";
import type { ComboRange } from "@/lib/postflopSolver/types";

/**
 * Disjoint suit pools for hero's vs villain's representative combos (see
 * canonicalRfiRange's doc comment for why disjointness matters).
 */
export const HERO_SUITS: [string, string] = [SUITS[0], SUITS[1]];
export const VILLAIN_SUITS: [string, string] = [SUITS[2], SUITS[3]];

function representativeCombo(hand: CanonicalHand, suits: [string, string]): [string, string] {
  if (hand.type === "pair") return [`${hand.rankHigh}${suits[0]}`, `${hand.rankHigh}${suits[1]}`];
  if (hand.type === "suited") return [`${hand.rankHigh}${suits[0]}`, `${hand.rankLow}${suits[0]}`];
  return [`${hand.rankHigh}${suits[0]}`, `${hand.rankLow}${suits[1]}`]; // offsuit
}

/**
 * A 169-entry ComboRange, one slot per canonical hand, weighted by its real
 * combo count — used instead of the app's usual 1326-physical-combo ranges
 * because a full preflop RFI tree solved at that granularity is far too slow
 * (see the Phase C-1 plan doc). `suits` must be disjoint from whatever suits
 * are used for the opposing side's range (HERO_SUITS vs VILLAIN_SUITS): if
 * hero and villain ever shared a suit pool, same-named hands (e.g. hero AA
 * vs villain AA) could get assigned identical concrete cards, and
 * `equityVsRange`'s card-removal check would then wrongly skip that
 * matchup entirely. Disjoint pools make card-sharing between hero and
 * villain structurally impossible, by construction.
 */
export function canonicalRfiRange(suits: [string, string]): ComboRange {
  return ALL_HANDS.map((h) => ({ cards: representativeCombo(h, suits), weight: h.combos }));
}
