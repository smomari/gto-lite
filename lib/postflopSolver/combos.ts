import { ALL_HANDS, HAND_BY_LABEL } from "@/lib/handRange/handList";
import { SUITS } from "@/lib/equity/assignCards";
import type { HandFrequency } from "@/types/rangeData";
import type { ComboRange } from "./types";

/** All physical (suit-concrete) card combos for one canonical hand label, e.g. "AKs" -> 4 combos. */
export function enumerateCombos(canonicalHandLabel: string): [string, string][] {
  const hand = HAND_BY_LABEL.get(canonicalHandLabel);
  if (!hand) throw new Error(`Unknown canonical hand: ${canonicalHandLabel}`);

  const combos: [string, string][] = [];
  if (hand.type === "pair") {
    for (let i = 0; i < SUITS.length; i++) {
      for (let j = i + 1; j < SUITS.length; j++) {
        combos.push([`${hand.rankHigh}${SUITS[i]}`, `${hand.rankHigh}${SUITS[j]}`]);
      }
    }
  } else if (hand.type === "suited") {
    for (const suit of SUITS) {
      combos.push([`${hand.rankHigh}${suit}`, `${hand.rankLow}${suit}`]);
    }
  } else {
    for (const suitHigh of SUITS) {
      for (const suitLow of SUITS) {
        if (suitHigh === suitLow) continue;
        combos.push([`${hand.rankHigh}${suitHigh}`, `${hand.rankLow}${suitLow}`]);
      }
    }
  }
  return combos;
}

/**
 * Expands a 169-canonical-hand preflop `HandFrequency[]` into a concrete,
 * board-aware `ComboRange`: each physical combo of a canonical hand gets the
 * same weight as that hand's frequency (consistent with how the rest of the
 * app already combo-weights — frequency x combo count = total weighted
 * combos, e.g. `components/ActionSummaryTiles.tsx`), and any combo sharing a
 * card with `blockedCards` (the board) is dropped as impossible.
 *
 * `actionWeight` picks which of a hand's fold/call/raise/allin frequencies
 * defines "this seat's range, given the action they actually took to reach
 * this spot" — e.g. `(hf) => hf.call` for a seat that called.
 */
export function expandToCombos(
  handFrequencies: HandFrequency[],
  actionWeight: (hf: HandFrequency) => number,
  blockedCards: string[],
): ComboRange {
  const range: ComboRange = [];
  for (const hf of handFrequencies) {
    const weight = actionWeight(hf);
    if (weight <= 0) continue;
    for (const [c1, c2] of enumerateCombos(hf.hand)) {
      range.push({ cards: [c1, c2], weight });
    }
  }
  return filterBlockedCombos(range, blockedCards);
}

/** Drops any combo sharing a card with `blockedCards` (e.g. the board) — used both by `expandToCombos` and by combo-level ranges carried forward from a prior street, where a newly-dealt card (e.g. the turn) hasn't been filtered against yet. */
export function filterBlockedCombos(range: ComboRange, blockedCards: string[]): ComboRange {
  const blocked = new Set(blockedCards);
  return range.filter(({ cards: [c1, c2] }) => !blocked.has(c1) && !blocked.has(c2));
}

/** Total combo count across ALL_HANDS, for sanity checks (should be 1326 = C(52,2)). */
export const TOTAL_PREFLOP_COMBOS = ALL_HANDS.reduce((sum, h) => sum + h.combos, 0);
