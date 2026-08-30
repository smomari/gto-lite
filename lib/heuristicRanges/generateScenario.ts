import { ALL_HANDS } from "@/lib/handRange/handList";
import type { HandFrequency } from "@/types/rangeData";
import {
  MIX_BUFFER,
  OPEN_THRESHOLD_MIN,
  OPEN_THRESHOLD_MAX,
  SB_OPEN_DISCOUNT,
  BASE_CONTINUE_THRESHOLD,
  RAISE_DEPTH_TIGHTEN_FACTOR,
  IP_CONTINUE_MULTIPLIER,
  OOP_CONTINUE_MULTIPLIER,
  POT_ODDS_REFERENCE_RATIO,
  POT_ODDS_MIN_ADJUST,
  POT_ODDS_MAX_ADJUST,
  RAISE_FRACTION_BASE,
  RAISE_FRACTION_IP_BONUS,
  RAISE_FRACTION_DEPTH_PENALTY,
  RAISE_FRACTION_MIN,
  RAISE_FRACTION_MAX,
} from "./config";

/** Percentile ranking: hand -> 0 (best) .. 1 (worst). */
export type PercentileRanking = Map<string, number>;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

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

/**
 * Opening percentile threshold for a given seat, by seat index (0=UTG..5=BTN).
 * `seatIndex === 6` (SB) is a discount off BTN's value rather than continuing
 * the linear ramp, since SB conventionally opens tighter than BTN despite
 * sitting "later" in raw seat order. BB (index 7) never opens.
 */
function openThresholdForSeatIndex(seatIdx: number): number {
  const btnThreshold = OPEN_THRESHOLD_MIN + (OPEN_THRESHOLD_MAX - OPEN_THRESHOLD_MIN) * (5 / 5);
  if (seatIdx === 6) return btnThreshold * SB_OPEN_DISCOUNT;
  if (seatIdx < 0 || seatIdx > 5) {
    throw new Error(`openThresholdForSeatIndex: seat index ${seatIdx} cannot open`);
  }
  return OPEN_THRESHOLD_MIN + (OPEN_THRESHOLD_MAX - OPEN_THRESHOLD_MIN) * (seatIdx / 5);
}

/** Opening decision: two-way, open (raise) or fold. */
export function generateOpeningScenario(ranking: PercentileRanking, seatIdx: number): HandFrequency[] {
  const threshold = openThresholdForSeatIndex(seatIdx);
  return handFrequencies(ranking, (p) => {
    const raise = softInclude(p, threshold);
    return { fold: 1 - raise, call: 0, raise };
  });
}

export interface FacingRaiseParams {
  /** Number of raises/allin-as-raise events in the hand so far; always >= 1. */
  raiseDepth: number;
  /** Whether hero's seat is after the most recent aggressor's seat in table order. */
  isIP: boolean;
  /** Pot size (bb) before hero acts, including all blinds/ante/prior bets. */
  potBb: number;
  /** Amount (bb) hero must add to call the current bet. */
  amountOwedBb: number;
}

function continueThresholdFor(params: FacingRaiseParams): number {
  const potOddsRatio = params.amountOwedBb / (params.potBb + params.amountOwedBb);
  const potOddsAdjust = clamp(
    POT_ODDS_REFERENCE_RATIO / potOddsRatio,
    POT_ODDS_MIN_ADJUST,
    POT_ODDS_MAX_ADJUST,
  );
  const depthFactor = Math.pow(RAISE_DEPTH_TIGHTEN_FACTOR, params.raiseDepth - 1);
  const positionMultiplier = params.isIP ? IP_CONTINUE_MULTIPLIER : OOP_CONTINUE_MULTIPLIER;
  return clamp(BASE_CONTINUE_THRESHOLD * depthFactor * positionMultiplier * potOddsAdjust, 0.01, 0.95);
}

function raiseFractionFor(params: FacingRaiseParams): number {
  const ipBonus = params.isIP ? RAISE_FRACTION_IP_BONUS : 0;
  const depthPenalty = RAISE_FRACTION_DEPTH_PENALTY * (params.raiseDepth - 1);
  return clamp(RAISE_FRACTION_BASE + ipBonus - depthPenalty, RAISE_FRACTION_MIN, RAISE_FRACTION_MAX);
}

/**
 * Facing a raise: three-way decision (fold/call/re-raise). Reused for every
 * raise depth (vs-open, vs-3bet, vs-4bet, ...) via `params.raiseDepth` rather
 * than a distinct function per named scenario.
 */
export function generateFacingRaiseScenario(
  ranking: PercentileRanking,
  params: FacingRaiseParams,
): HandFrequency[] {
  const continueThreshold = continueThresholdFor(params);
  const raiseFraction = raiseFractionFor(params);
  const raiseThreshold = continueThreshold * raiseFraction;
  return handFrequencies(ranking, (p) => {
    const continueFreq = softInclude(p, continueThreshold);
    const raise = softInclude(p, raiseThreshold) * continueFreq;
    const call = continueFreq - raise;
    return { fold: 1 - continueFreq, call, raise };
  });
}
