import type { HandFrequency, Position, RangeSource } from "@/types/rangeData";
import type { EquityMatrix } from "@/lib/equity/loadEquityMatrix";
import { ALL_HANDS, TOTAL_COMBOS } from "@/lib/handRange/handList";
import { SEAT_ORDER, postflopSeatIndex, seatIndex } from "@/lib/actionTree/seatOrder";
import {
  generateBbVsLimpScenario,
  generateFacingRaiseScenario,
  generateOpeningScenario,
  generateSbFirstInScenario,
  openWidthFor,
  type FacingRaiseParams,
} from "@/lib/heuristicRanges/generateScenario";
import { RAISE_VALUE_SHARE, RAKE_CONTINUE_FALLOFF, RERAISE_KEEP_BASE } from "@/lib/heuristicRanges/config";
import { generateCallShoveScenario, generateVsReraiseScenario, type VsReraiseParams } from "@/lib/heuristicRanges/vsReraise";
import type { FrequencyMap } from "@/lib/nashSolver/pushFoldSolver";
import { firstInWidthsUnder, tunedAt, type FirstInAnchor, type GameFormat } from "./gameFormat";
import { computeRawRaiseTo } from "./actionSizing";
import { aggressiveFrequencies } from "./postflopHandoff";
import { callersOf, type PotState, type SeatDecision } from "./potState";
import { NO_RAKE_SETTINGS, rakeShare, type RakeSettings } from "./rake";
import { shouldUseNash } from "./classify";
import { getPlayabilityRanking, getPushFoldResult } from "./solveCache";

export interface SolvedNode {
  hands: HandFrequency[];
  source: RangeSource;
}

function shoveFrequencyToHands(shoveFreq: Map<string, number>): HandFrequency[] {
  return ALL_HANDS.map((h) => {
    const allin = shoveFreq.get(h.hand) ?? 0;
    return { hand: h.hand, fold: 1 - allin, call: 0, raise: 0, allin };
  });
}

function callFrequencyToHands(callFreq: Map<string, number>): HandFrequency[] {
  return ALL_HANDS.map((h) => {
    const call = callFreq.get(h.hand) ?? 0;
    return { hand: h.hand, fold: 1 - call, call, raise: 0 };
  });
}

/** The hands a seat came out of a decision with: the frequency of what it chose there. */
function rangeAfter(
  matrix: EquityMatrix,
  seat: Position,
  decision: SeatDecision,
  effectiveStackBb: number,
  rake: RakeSettings,
): FrequencyMap {
  const { hands } = solveActiveSeat(matrix, seat, decision.state, effectiveStackBb, rake);
  const aggressive = decision.action === "raise" || decision.action === "allin";
  const frequencies = aggressive ? aggressiveFrequencies(hands) : hands.map((h) => h.call);
  return new Map(hands.map((h, i) => [h.hand, frequencies[i]]));
}

function shareOfCombos(range: FrequencyMap): number {
  return ALL_HANDS.reduce((sum, h) => sum + (range.get(h.hand) ?? 0) * h.combos, 0) / TOTAL_COMBOS;
}

/** What every branch of solveActiveSeat reads about the spot in front of the active seat. */
interface SpotContext {
  matrix: EquityMatrix;
  activeSeat: Position;
  potState: PotState;
  effectiveStackBb: number;
  rake: RakeSettings;
  /** The format tuned to this stack. */
  format: GameFormat;
  firstInWidths: readonly FirstInAnchor[];
  hasOpener: boolean;
  remainingStackBb: number;
  amountOwedBb: number;
  lastAggressor: Position | null;
  ownDecision: SeatDecision | undefined;
  raiserDecision: SeatDecision | null | undefined;
  /** What the active seat and the last raiser came out of their last decisions with. */
  heroRange: FrequencyMap | undefined;
  villainRange: FrequencyMap | null | undefined;
}

/** A spot facing a raise: the last aggressor is known. */
interface FacingRaiseContext extends SpotContext {
  lastAggressor: Position;
  isIP: boolean;
  isBlind: boolean;
  calledLast: boolean;
}

function spotContext(
  matrix: EquityMatrix,
  activeSeat: Position,
  potState: PotState,
  effectiveStackBb: number,
  rake: RakeSettings,
): SpotContext {
  const format = tunedAt(potState.format, effectiveStackBb);
  const lastAggressor = potState.lastAggressor;
  const ownDecision = potState.lastDecision[activeSeat];
  const raiserDecision = lastAggressor && potState.lastDecision[lastAggressor];
  return {
    matrix,
    activeSeat,
    potState,
    effectiveStackBb,
    rake,
    format,
    firstInWidths: firstInWidthsUnder(format, rake),
    hasOpener: potState.raiseDepth >= 1,
    remainingStackBb: effectiveStackBb - (potState.committed[activeSeat] ?? 0),
    amountOwedBb: potState.currentBetToCall - (potState.committed[activeSeat] ?? 0),
    lastAggressor,
    ownDecision,
    raiserDecision,
    heroRange: ownDecision && rangeAfter(matrix, activeSeat, ownDecision, effectiveStackBb, rake),
    villainRange: raiserDecision && rangeAfter(matrix, lastAggressor, raiserDecision, effectiveStackBb, rake),
  };
}

/**
 * Computes the 169-hand action-frequency distribution for whichever seat is
 * currently active, given the replayed pot state. Routes to the Nash
 * push/fold solver or the generalized heuristic engine per classify.ts.
 */
export function solveActiveSeat(
  matrix: EquityMatrix,
  activeSeat: Position,
  potState: PotState,
  effectiveStackBb: number,
  rake: RakeSettings = NO_RAKE_SETTINGS,
): SolvedNode {
  const ctx = spotContext(matrix, activeSeat, potState, effectiveStackBb, rake);
  if (shouldUseNash(effectiveStackBb, ctx.remainingStackBb, potState.potBb, ctx.hasOpener)) return solveShoveSpot(ctx);
  if (!ctx.hasOpener) return solveFirstIn(ctx);
  const lastAggressor = ctx.lastAggressor!;
  return solveFacingRaise({
    ...ctx,
    lastAggressor,
    isIP: postflopSeatIndex(activeSeat) > postflopSeatIndex(lastAggressor),
    isBlind: activeSeat === "SB" || activeSeat === "BB",
    calledLast: ctx.ownDecision?.action === "call",
  });
}

/** Both seats came here with ranges of their own, so the raise is priced against them. */
function handsFacingRaise(ctx: SpotContext): ctx is SpotContext & { heroRange: FrequencyMap; villainRange: FrequencyMap } {
  return !!ctx.heroRange && !!ctx.villainRange && shareOfCombos(ctx.heroRange) > 0 && shareOfCombos(ctx.villainRange) > 0;
}

function solveShoveSpot(ctx: SpotContext): SolvedNode {
  const { matrix, potState, rake, villainRange } = ctx;
  // A fresh shove is the game the Nash solver models; anything after more
  // action has a bigger pot and known ranges of its own, so price it directly.
  if (villainRange && shareOfCombos(villainRange) > 0 && (ctx.ownDecision || potState.raiseDepth >= 2)) {
    return {
      source: "heuristic-approx",
      hands: generateCallShoveScenario(matrix, {
        heroRange: handsFacingRaise(ctx) ? ctx.heroRange : new Map(ALL_HANDS.map((h) => [h.hand, 1])),
        villainRange,
        potBb: potState.potBb,
        amountOwedBb: ctx.amountOwedBb,
        rake: rake.structure,
      }),
    };
  }
  const shover = ctx.lastAggressor ?? ctx.activeSeat;
  const opponentsBehind = Math.max(1, SEAT_ORDER.length - 1 - seatIndex(shover));
  const result = getPushFoldResult(matrix, ctx.remainingStackBb, opponentsBehind, ctx.format.bbAnteBb, rake);
  return {
    source: "nash-shove-fold",
    hands: ctx.hasOpener ? callFrequencyToHands(result.callFrequency) : shoveFrequencyToHands(result.shoveFrequency),
  };
}

function solveFirstIn(ctx: SpotContext): SolvedNode {
  const { activeSeat, effectiveStackBb, format, firstInWidths } = ctx;
  const ranking = getPlayabilityRanking(ctx.matrix);
  if (activeSeat === "BB") return { source: "heuristic-approx", hands: generateBbVsLimpScenario(ranking) };
  if (activeSeat === "SB" && format.sbCanLimp) {
    return { source: "heuristic-approx", hands: generateSbFirstInScenario(ranking, effectiveStackBb, firstInWidths, format.sbRaiseSpread) };
  }
  return {
    source: "heuristic-approx",
    hands: generateOpeningScenario(ranking, seatIndex(activeSeat), effectiveStackBb, firstInWidths),
  };
}

function solveFacingRaise(ctx: FacingRaiseContext): SolvedNode {
  const ranking = getPlayabilityRanking(ctx.matrix);
  const hands = handsFacingRaise(ctx)
    ? generateVsReraiseScenario(ctx.matrix, ranking, vsReraiseParams(ctx, ctx.heroRange, ctx.villainRange))
    : generateFacingRaiseScenario(ranking, facingRaiseParams(ctx));
  return { source: "heuristic-approx", hands: reraisesAllIn(ctx) ? jamReraises(hands) : hands };
}

/** A re-raise that would put in most of a stack is made all-in instead. */
function reraisesAllIn(ctx: FacingRaiseContext): boolean {
  const { format, potState, effectiveStackBb } = ctx;
  const jamShare = format.jamReraiseShare && (potState.raiseDepth >= 2 ? format.jamReraiseShare.fourBet : format.jamReraiseShare.threeBet);
  return jamShare !== undefined && Math.min(computeRawRaiseTo(ctx.activeSeat, potState, effectiveStackBb), effectiveStackBb) >= jamShare * effectiveStackBb;
}

function jamReraises(hands: HandFrequency[]): HandFrequency[] {
  return hands.map((h) => ({ ...h, raise: 0, allin: (h.allin ?? 0) + h.raise }));
}

/** A 3-bet made over an open someone called is a squeeze. */
function facingSqueeze(ctx: FacingRaiseContext): boolean {
  return ctx.potState.raiseDepth === 2 && !!ctx.raiserDecision && callersOf(ctx.raiserDecision.state, ctx.lastAggressor).length > 0;
}

/** The 4-bet width and bluff share against this 3-bet. */
function fourBetTuning(ctx: FacingRaiseContext): { widthRatio: number; bluffShare: number } {
  const { format, potState, activeSeat } = ctx;
  // A 3-bet made in position on an opener that isn't a blind.
  const facingThreeBetInPosition = potState.raiseDepth === 2 && !ctx.isIP && !ctx.isBlind && !ctx.calledLast;
  const sbFacingBbThreeBet =
    potState.raiseDepth === 2 && activeSeat === "SB" && ctx.lastAggressor === "BB" && ctx.ownDecision?.action === "raise";
  return (facingThreeBetInPosition && format.fourBet.vsInPosition) || (sbFacingBbThreeBet && format.fourBet.sbVsBb) || format.fourBet;
}

/** The share of a plain 3-bet's continuing range kept here: less against a squeeze, and in the SB's own 3-bet spots. */
function reraiseKeepFactor(ctx: FacingRaiseContext): number {
  const { format, potState, activeSeat, lastAggressor, calledLast } = ctx;
  const reraisedOwnRaise = potState.raiseDepth === 2 && ctx.ownDecision?.action === "raise";
  return (
    (facingSqueeze(ctx) ? (calledLast ? format.squeezeKeepFactor.caller : format.squeezeKeepFactor.opener) : 1) *
    (activeSeat === "SB" && reraisedOwnRaise ? (format.sbOpenerKeepFactor ?? 1) : 1) *
    (lastAggressor === "SB" && reraisedOwnRaise ? (format.sbThreeBetKeepFactor ?? 1) : 1)
  );
}

function vsReraiseParams(ctx: FacingRaiseContext, heroRange: FrequencyMap, villainRange: FrequencyMap): VsReraiseParams {
  const { format, potState, calledLast } = ctx;
  const villainShare = shareOfCombos(villainRange);
  const common = { heroRange, villainRange, isIP: ctx.isIP, potBb: potState.potBb, amountOwedBb: ctx.amountOwedBb };
  if (potState.raiseDepth < 2) {
    // A limper raised over: the 4-bet tuning doesn't apply, and nothing was compared here.
    return {
      ...common,
      raiseWidth: villainShare * format.threeBetWidthRatio * RAISE_VALUE_SHARE,
      bluffWidth: 0,
      keepBase: RERAISE_KEEP_BASE,
      maxRaiseShareOfKept: format.calledReraiseShareCap,
      rake: ctx.rake.structure,
    };
  }
  const fourBet = fourBetTuning(ctx);
  return {
    ...common,
    raiseWidth: villainShare * fourBet.widthRatio * format.fourBet.valueShare,
    // A flatting range is capped: it has nothing to spare for bluffs.
    bluffWidth: calledLast ? 0 : villainShare * fourBet.widthRatio * fourBet.bluffShare,
    keepBase: format.reraiseKeepBase,
    keepFactor: reraiseKeepFactor(ctx),
    ...(calledLast ? { maxRaiseShareOfKept: format.calledReraiseShareCap } : { valueInDeckCombos: true }),
    rake: ctx.rake.structure,
  };
}

/** The 3-bet width as a share of the opener's: the BB against the SB, the SB, other blinds, and seats that aren't blinds. */
function threeBetWidthRatioFor(ctx: FacingRaiseContext, blindVsBlind: GameFormat["blindVsBlind"]): number {
  const { format, activeSeat } = ctx;
  return (
    blindVsBlind?.threeBetWidthRatio ??
    (activeSeat === "SB" && format.sbThreeBetWidthRatio !== undefined
      ? format.sbThreeBetWidthRatio
      : ctx.isBlind
        ? format.threeBetWidthRatio
        : format.nonBlindThreeBetWidthRatio)
  );
}

/** Flats shrink for the SB, and for each seat that already called, harder when that caller is in position on hero. */
function flatCallFactor(ctx: FacingRaiseContext): number {
  const { format, activeSeat } = ctx;
  return (
    (activeSeat === "SB" ? (format.sbFlatFactor ?? 1) : 1) *
    callersOf(ctx.potState, activeSeat).reduce(
      (factor, caller) =>
        factor * (postflopSeatIndex(caller) > postflopSeatIndex(activeSeat) ? format.overcallFactor.ipCaller : format.overcallFactor.oopCaller),
      1,
    )
  );
}

function facingRaiseParams(ctx: FacingRaiseContext): FacingRaiseParams {
  const { format, potState, activeSeat, lastAggressor, effectiveStackBb, firstInWidths } = ctx;
  // BB's raise over a limp leaves SB closing the action, though BB sits "behind" it.
  const seatsBehind = seatIndex(lastAggressor) > seatIndex(activeSeat) ? 0 : SEAT_ORDER.length - 1 - seatIndex(activeSeat);
  // The BB against the SB's first-in raise, heads-up and in position on it.
  const blindVsBlind = potState.raiseDepth === 1 && activeSeat === "BB" && lastAggressor === "SB" ? format.blindVsBlind : undefined;
  return {
    raiseDepth: potState.raiseDepth,
    isIP: ctx.isIP,
    potBb: potState.potBb,
    amountOwedBb: ctx.amountOwedBb,
    aggressorOpenWidth: openWidthFor(Math.min(seatIndex(lastAggressor), 6), effectiveStackBb, firstInWidths),
    referenceOpenWidth: openWidthFor(seatIndex("BTN"), effectiveStackBb, firstInWidths),
    openerWidthExponent: seatsBehind === 0 ? format.closingWidthExponent : undefined,
    coldCallIpFactor: format.coldCallIpFactor,
    seatsBehind,
    threeBetWidthRatio: threeBetWidthRatioFor(ctx, blindVsBlind),
    coldCallBase: format.coldCallBase,
    coldCallOopMultiplier: format.coldCallOopMultiplier,
    closingContinueFactor: format.closingContinueFactor * (blindVsBlind?.continueFactor ?? 1),
    threeBetValueShare: format.threeBetValueShare,
    continueFactor: Math.exp(-RAKE_CONTINUE_FALLOFF * rakeShare(ctx.rake.structure)),
    callFactor: flatCallFactor(ctx),
  };
}
