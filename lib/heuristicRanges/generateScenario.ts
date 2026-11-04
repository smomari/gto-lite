import { RANKS } from "@/lib/cards";
import { ALL_HANDS, TOTAL_COMBOS, type CanonicalHand } from "@/lib/handRange/handList";
import type { FirstInAnchor } from "@/lib/solveEngine/gameFormat";
import type { HandFrequency } from "@/types/rangeData";
import {
  MIX_BUFFER,
  FIRST_IN_WIDTHS_BY_STACK,
  JAM_MIN_STACK_BB,
  JAM_MAX_STACK_BB,
  JAM_MAX_SHARE,
  RAISE_KEEP_SHARE,
  BB_VS_LIMP_VALUE_WIDTH,
  BB_VS_LIMP_BLUFF_WIDTH,
  COLD_CALL_PER_SEAT_BEHIND,
  RAISE_VALUE_SHARE,
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

function firstInWidth<A extends FirstInAnchor>(
  anchors: readonly A[],
  pick: (anchor: A) => number,
  effectiveStackBb: number,
): number {
  const upperIndex = anchors.findIndex((a) => a.stackBb >= effectiveStackBb);
  if (upperIndex === 0) return pick(anchors[0]);
  if (upperIndex === -1) return pick(anchors[anchors.length - 1]);
  const lower = anchors[upperIndex - 1];
  const upper = anchors[upperIndex];
  const t = (effectiveStackBb - lower.stackBb) / (upper.stackBb - lower.stackBb);
  return pick(lower) + (pick(upper) - pick(lower)) * t;
}

/** Share of combos seat `seatIdx` (0=UTG..6=SB) opens at this stack. BB (index 7) never opens. */
export function openWidthFor(
  seatIdx: number,
  effectiveStackBb: number,
  anchors: readonly FirstInAnchor[] = FIRST_IN_WIDTHS_BY_STACK,
): number {
  if (seatIdx < 0 || seatIdx > 6) {
    throw new Error(`openWidthFor: seat index ${seatIdx} cannot open`);
  }
  return firstInWidth(anchors, (a) => a.widths[seatIdx], effectiveStackBb);
}

function jamShareFor(effectiveStackBb: number): number {
  const depth = (JAM_MAX_STACK_BB - effectiveStackBb) / (JAM_MAX_STACK_BB - JAM_MIN_STACK_BB);
  return clamp(depth, 0, 1) * JAM_MAX_SHARE;
}

/** Splits a hand's raising frequency into raise and jam, per jamShareFor. Above its stacks the hand is left without an `allin` key. */
function withJams(hand: HandFrequency, percentile: number, raiseWidth: number, effectiveStackBb: number): HandFrequency {
  const jamShare = jamShareFor(effectiveStackBb);
  if (jamShare === 0 || percentile <= raiseWidth * RAISE_KEEP_SHARE) return hand;
  return { ...hand, raise: hand.raise * (1 - jamShare), allin: hand.raise * jamShare };
}

/** Opening decision: two-way, open (raise) or fold. */
export function generateOpeningScenario(
  ranking: PercentileRanking,
  seatIdx: number,
  effectiveStackBb: number,
  anchors: readonly FirstInAnchor[] = FIRST_IN_WIDTHS_BY_STACK,
): HandFrequency[] {
  const threshold = openWidthFor(seatIdx, effectiveStackBb, anchors);
  return handFrequencies(ranking, (p) => {
    const raise = softInclude(p, threshold);
    return { fold: 1 - raise, call: 0, raise };
  }).map((h) => withJams(h, ranking.get(h.hand) ?? 1, threshold, effectiveStackBb));
}

/**
 * SB folded to: raises some hands, limps most of the rest, folds the bottom.
 * `raiseSpread` of the raises are spread evenly over everything it plays and
 * the rest go to its best hands: deep, a solver's SB raises a slice of every
 * hand it plays rather than a top tier, so a 3-bet folds most of them out.
 */
export function generateSbFirstInScenario(
  ranking: PercentileRanking,
  effectiveStackBb: number,
  anchors: readonly FirstInAnchor[] = FIRST_IN_WIDTHS_BY_STACK,
  raiseSpread = 0,
): HandFrequency[] {
  const playThreshold = firstInWidth(anchors, (a) => a.sbPlay!, effectiveStackBb);
  const raiseThreshold = firstInWidth(anchors, (a) => a.sbRaise!, effectiveStackBb);
  return handFrequencies(ranking, (p) => {
    const play = softInclude(p, playThreshold);
    const raise = (1 - raiseSpread) * softInclude(p, raiseThreshold) + raiseSpread * play * (raiseThreshold / playThreshold);
    return { fold: 1 - play, call: play - raise, raise };
  }).map((h) => withJams(h, ranking.get(h.hand) ?? 1, raiseThreshold, effectiveStackBb));
}

export interface FacingRaiseParams {
  /** Number of raises/allin-as-raise events in the hand so far; always >= 1. */
  raiseDepth: number;
  /** Whether hero acts after the most recent aggressor postflop. */
  isIP: boolean;
  /** Pot size (bb) before hero acts, including all blinds/ante/prior bets. */
  potBb: number;
  /** Amount (bb) hero must add to call the current bet. */
  amountOwedBb: number;
  /** Share of combos the last aggressor's opening seat opens. */
  aggressorOpenWidth: number;
  /** Seats left to act after hero; 0 means hero closes the action. */
  seatsBehind: number;
  /** 3-bet width as a share of the opener's width. */
  threeBetWidthRatio: number;
  /** Share of the BB's continuing range that a cold caller keeps: IP, with two seats behind. */
  coldCallBase: number;
  /** Multiplies the width that continues against an open. */
  continueFactor: number;
  coldCallOopMultiplier: number;
  /** Shrinks the flats, but not the 3-bets, against an open someone already called. 1 when no one has. */
  callFactor: number;
  /** Multiplies what a seat closing the action continues with. */
  closingContinueFactor: number;
  /** Share of the 3-bets that are value. Default RAISE_VALUE_SHARE. */
  threeBetValueShare?: number;
}

function potOddsAdjustFor(params: FacingRaiseParams): number {
  const potOddsRatio = params.amountOwedBb / (params.potBb + params.amountOwedBb);
  return clamp(POT_ODDS_REFERENCE_RATIO / potOddsRatio, POT_ODDS_MIN_ADJUST, POT_ODDS_MAX_ADJUST);
}

/** A seat that closes the action has no squeeze to fear; the others keep a share that shrinks with each seat behind. */
function vsOpenContinueThreshold(params: FacingRaiseParams): number {
  const seatShare =
    params.seatsBehind === 0
      ? params.closingContinueFactor
      : params.coldCallBase *
        Math.pow(COLD_CALL_PER_SEAT_BEHIND, params.seatsBehind - 2) *
        (params.isIP ? 1 : params.coldCallOopMultiplier);
  // The square root keeps a cheap call from pulling in nearly every hand: price matters less than the opener's range here.
  return clamp(Math.sqrt(params.aggressorOpenWidth * potOddsAdjustFor(params)) * seatShare * params.continueFactor, 0.01, 0.95);
}

function vsReraiseContinueThreshold(params: FacingRaiseParams): number {
  const depthFactor = Math.pow(RAISE_DEPTH_TIGHTEN_FACTOR, params.raiseDepth - 1);
  const positionMultiplier = params.isIP ? IP_CONTINUE_MULTIPLIER : OOP_CONTINUE_MULTIPLIER;
  return clamp(BASE_CONTINUE_THRESHOLD * depthFactor * positionMultiplier * potOddsAdjustFor(params), 0.01, 0.95);
}

function raiseFractionFor(params: FacingRaiseParams): number {
  const ipBonus = params.isIP ? RAISE_FRACTION_IP_BONUS : 0;
  const depthPenalty = RAISE_FRACTION_DEPTH_PENALTY * (params.raiseDepth - 1);
  return clamp(RAISE_FRACTION_BASE + ipBonus - depthPenalty, RAISE_FRACTION_MIN, RAISE_FRACTION_MAX);
}

/** Suited hands with a draw to the nuts or a straight: what a 3-bet bluffs with instead of the next-best value hands. */
export function isThreeBetBluffCandidate(h: CanonicalHand): boolean {
  if (h.type !== "suited") return false;
  const low = RANKS.indexOf(h.rankLow);
  return h.rankHigh === "A" ? low >= RANKS.indexOf("5") : low - RANKS.indexOf(h.rankHigh) <= 3;
}

/** Bluff frequency per hand: the best candidates outside the value range until `bluffWidth` of all combos is filled. */
function threeBetBluffs(ranking: PercentileRanking, valueThreshold: number, bluffWidth: number): Map<string, number> {
  const candidates = ALL_HANDS.filter(
    (h) => isThreeBetBluffCandidate(h) && (ranking.get(h.hand) ?? 1) > valueThreshold - MIX_BUFFER / 2,
  ).sort((a, b) => (ranking.get(a.hand) ?? 1) - (ranking.get(b.hand) ?? 1));
  const bluffs = new Map<string, number>();
  let combosLeft = bluffWidth * TOTAL_COMBOS;
  for (const h of candidates) {
    if (combosLeft <= 0) break;
    bluffs.set(h.hand, Math.min(1, combosLeft / h.combos));
    combosLeft -= h.combos;
  }
  return bluffs;
}

/** BB behind a limp: raises value and bluffs, checks the rest. Checking is free, so it never folds. */
export function generateBbVsLimpScenario(ranking: PercentileRanking): HandFrequency[] {
  const bluffs = threeBetBluffs(ranking, BB_VS_LIMP_VALUE_WIDTH, BB_VS_LIMP_BLUFF_WIDTH);
  return ALL_HANDS.map((h) => {
    const raise = Math.max(softInclude(ranking.get(h.hand) ?? 1, BB_VS_LIMP_VALUE_WIDTH), bluffs.get(h.hand) ?? 0);
    return { hand: h.hand, fold: 0, call: 1 - raise, raise };
  });
}

function generateVsOpenScenario(ranking: PercentileRanking, params: FacingRaiseParams): HandFrequency[] {
  const continueThreshold = vsOpenContinueThreshold(params);
  const threeBetWidth = Math.min(params.aggressorOpenWidth * params.threeBetWidthRatio, continueThreshold);
  const valueThreshold = threeBetWidth * (params.threeBetValueShare ?? RAISE_VALUE_SHARE);
  const bluffs = threeBetBluffs(ranking, valueThreshold, threeBetWidth - valueThreshold);
  // The flats sit between the 3-bets and the continuing threshold; a caller in front narrows only that band.
  const callThreshold =
    params.callFactor === 1 ? continueThreshold : threeBetWidth + (continueThreshold - threeBetWidth) * params.callFactor;
  return ALL_HANDS.map((h) => {
    const percentile = ranking.get(h.hand) ?? 1;
    const raise = Math.max(softInclude(percentile, valueThreshold), bluffs.get(h.hand) ?? 0);
    const call = Math.max(softInclude(percentile, callThreshold) - raise, 0);
    return { hand: h.hand, fold: 1 - raise - call, call, raise };
  });
}

/**
 * Facing a raise: three-way decision (fold/call/re-raise). An open uses the
 * opener's width; deeper spots (vs-3bet, vs-4bet, ...) share one formula via
 * `params.raiseDepth` rather than a distinct function per named scenario.
 */
export function generateFacingRaiseScenario(
  ranking: PercentileRanking,
  params: FacingRaiseParams,
): HandFrequency[] {
  if (params.raiseDepth === 1) return generateVsOpenScenario(ranking, params);
  const continueThreshold = vsReraiseContinueThreshold(params);
  const raiseFraction = raiseFractionFor(params);
  const raiseThreshold = continueThreshold * raiseFraction;
  return handFrequencies(ranking, (p) => {
    const continueFreq = softInclude(p, continueThreshold);
    const raise = softInclude(p, raiseThreshold) * continueFreq;
    const call = continueFreq - raise;
    return { fold: 1 - continueFreq, call, raise };
  });
}
