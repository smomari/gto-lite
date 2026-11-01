import { RANKS } from "@/lib/cards";
import { ALL_HANDS, TOTAL_COMBOS, type CanonicalHand } from "@/lib/handRange/handList";
import type { EquityMatrix } from "./loadEquityMatrix";
import { equityOf } from "./loadEquityMatrix";

/**
 * Combo-weighted equity of `hand` against a uniformly random opponent hand,
 * derived straight from the equity matrix (no separate data source). Ignores
 * card removal between hero's own hand and the villain combo pool — an
 * accepted simplification at this canonical-hand granularity.
 */
export function equityVsRandom(matrix: EquityMatrix, hand: string): number {
  let weighted = 0;
  for (const villain of ALL_HANDS) {
    weighted += equityOf(matrix, hand, villain.hand) * villain.combos;
  }
  return weighted / TOTAL_COMBOS;
}

/** Equity bonuses for hands that play better postflop than their all-in equity says. */
const SUITED_BONUS = 0.04;
const CONNECTED_BONUS_BY_GAP = [0.045, 0.03, 0.012]; // index = rank gap - 1
const WHEEL_ACE_BONUS = 0.025; // A5s-A2s: nut flush draw, wheel draw
const SMALL_PAIR_BONUS = 0.035; // 88 and below: set value
const WEAK_OFFSUIT_PENALTY = 0.025; // unconnected offsuit hands flop few draws

function playabilityBonus(h: CanonicalHand): number {
  const gap = RANKS.indexOf(h.rankLow) - RANKS.indexOf(h.rankHigh);
  if (h.type === "pair") return RANKS.indexOf(h.rankHigh) >= RANKS.indexOf("8") ? SMALL_PAIR_BONUS : 0;
  const connected = CONNECTED_BONUS_BY_GAP[gap - 1] ?? 0;
  if (h.type === "offsuit") return connected > 0 ? connected / 2 : -WEAK_OFFSUIT_PENALTY;
  const wheelAce = h.rankHigh === "A" && RANKS.indexOf(h.rankLow) >= RANKS.indexOf("5");
  return SUITED_BONUS + connected + (wheelAce ? WHEEL_ACE_BONUS : 0);
}

/**
 * Percentile rank (0 = best) for ranges that see a flop: equity-vs-random plus
 * playabilityBonus, so 76s outranks K4o even though K4o wins more all-ins.
 * It's combo-weighted: a threshold of 0.3 selects about 30% of combos.
 * Push/fold doesn't use it, since its hands never play postflop.
 */
export function computePlayabilityRanking(matrix: EquityMatrix): Map<string, number> {
  const scored = ALL_HANDS.map((h) => ({ hand: h, score: equityVsRandom(matrix, h.hand) + playabilityBonus(h) }));
  scored.sort((a, b) => b.score - a.score);

  const ranking = new Map<string, number>();
  let combosAbove = 0;
  for (const { hand } of scored) {
    ranking.set(hand.hand, (combosAbove + hand.combos / 2) / TOTAL_COMBOS);
    combosAbove += hand.combos;
  }
  return ranking;
}
