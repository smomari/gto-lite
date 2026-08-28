import { ALL_HANDS } from "@/lib/handRange/handList";
import type { HandFrequency } from "@/types/rangeData";
import { MIX_BUFFER } from "./config";

/** Percentile ranking: hand -> 0 (best) .. 1 (worst). */
export type PercentileRanking = Map<string, number>;

/**
 * Soft threshold: 1 well inside the cutoff, 0 well outside, and a linear
 * ramp across a small buffer zone around `threshold` instead of a hard
 * cliff — so borderline hands get a partial/mixed frequency.
 */
function softInclude(percentile: number, threshold: number, buffer: number = MIX_BUFFER): number {
  const lo = threshold - buffer / 2;
  const hi = threshold + buffer / 2;
  if (percentile <= lo) return 1;
  if (percentile >= hi) return 0;
  return (hi - percentile) / (hi - lo);
}

function handFrequencies(
  ranking: PercentileRanking,
  build: (percentile: number) => { fold: number; call: number; raise: number },
): HandFrequency[] {
  return ALL_HANDS.map((h) => {
    const percentile = ranking.get(h.hand) ?? 1;
    const { fold, call, raise } = build(percentile);
    return { hand: h.hand, fold, call, raise };
  });
}

/** RFI: two-way decision, open (raise) or fold. */
export function generateRfiScenario(ranking: PercentileRanking, openThreshold: number): HandFrequency[] {
  return handFrequencies(ranking, (p) => {
    const raise = softInclude(p, openThreshold);
    return { fold: 1 - raise, call: 0, raise };
  });
}

/**
 * Three-way decision (fold/call/raise) shared by vs-open and squeeze nodes:
 * an overall "continue" threshold, then the top slice of the continuing range
 * re-raises and the rest calls.
 */
export function generateThreeWayScenario(
  ranking: PercentileRanking,
  continueThreshold: number,
  raiseFraction: number,
): HandFrequency[] {
  const raiseThreshold = continueThreshold * raiseFraction;
  return handFrequencies(ranking, (p) => {
    const continueFreq = softInclude(p, continueThreshold);
    const raise = softInclude(p, raiseThreshold) * continueFreq;
    const call = continueFreq - raise;
    return { fold: 1 - continueFreq, call, raise };
  });
}

/** vs-3bet: same three-way shape, continuing range splits into call vs 4-bet. */
export function generateVs3BetScenario(
  ranking: PercentileRanking,
  continueThreshold: number,
  fourBetFraction: number,
): HandFrequency[] {
  return generateThreeWayScenario(ranking, continueThreshold, fourBetFraction);
}
