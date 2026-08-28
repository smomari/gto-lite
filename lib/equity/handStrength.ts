import { ALL_HANDS } from "@/lib/handRange/handList";
import type { EquityMatrix } from "./loadEquityMatrix";
import { equityOf } from "./loadEquityMatrix";

const TOTAL_COMBOS = ALL_HANDS.reduce((sum, h) => sum + h.combos, 0);

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

/**
 * Percentile rank of every hand by equity-vs-random, 0 = strongest (AA), 1 = weakest.
 */
export function computePercentileRanking(matrix: EquityMatrix): Map<string, number> {
  const withStrength = ALL_HANDS.map((h) => ({
    hand: h.hand,
    strength: equityVsRandom(matrix, h.hand),
  }));
  withStrength.sort((a, b) => b.strength - a.strength);

  const ranking = new Map<string, number>();
  withStrength.forEach((entry, index) => {
    ranking.set(entry.hand, index / (withStrength.length - 1));
  });
  return ranking;
}
