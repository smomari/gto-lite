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
} from "@/lib/heuristicRanges/generateScenario";
import { RAISE_VALUE_SHARE, RAKE_CONTINUE_FALLOFF } from "@/lib/heuristicRanges/config";
import { generateCallShoveScenario, generateVsReraiseScenario } from "@/lib/heuristicRanges/vsReraise";
import type { FrequencyMap } from "@/lib/nashSolver/pushFoldSolver";
import { firstInWidthsUnder } from "./gameFormat";
import { aggressiveFrequencies } from "./postflopHandoff";
import type { PotState, SeatDecision } from "./potState";
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
  const { format } = potState;
  const firstInWidths = firstInWidthsUnder(format, rake);
  const hasOpener = potState.raiseDepth >= 1;
  const remainingStackBb = effectiveStackBb - (potState.committed[activeSeat] ?? 0);

  const lastAggressor = potState.lastAggressor;
  const amountOwedBb = potState.currentBetToCall - (potState.committed[activeSeat] ?? 0);
  const ownDecision = potState.lastDecision[activeSeat];
  const raiserDecision = lastAggressor && potState.lastDecision[lastAggressor];
  const heroRange = ownDecision && rangeAfter(matrix, activeSeat, ownDecision, effectiveStackBb, rake);
  const villainRange = raiserDecision && rangeAfter(matrix, lastAggressor, raiserDecision, effectiveStackBb, rake);
  const handsFacingRaise = !!heroRange && !!villainRange && shareOfCombos(heroRange) > 0 && shareOfCombos(villainRange) > 0;

  if (shouldUseNash(effectiveStackBb, remainingStackBb, potState.potBb, hasOpener)) {
    // A fresh shove is the game the Nash solver models; anything after more
    // action has a bigger pot and known ranges of its own, so price it directly.
    if (villainRange && shareOfCombos(villainRange) > 0 && (ownDecision || potState.raiseDepth >= 2)) {
      return {
        source: "heuristic-approx",
        hands: generateCallShoveScenario(matrix, {
          heroRange: handsFacingRaise ? heroRange : new Map(ALL_HANDS.map((h) => [h.hand, 1])),
          villainRange,
          potBb: potState.potBb,
          amountOwedBb,
          rake: rake.structure,
        }),
      };
    }
    const shover = lastAggressor ?? activeSeat;
    const opponentsBehind = Math.max(1, SEAT_ORDER.length - 1 - seatIndex(shover));
    const result = getPushFoldResult(matrix, remainingStackBb, opponentsBehind, format.bbAnteBb, rake);
    return {
      source: "nash-shove-fold",
      hands: hasOpener ? callFrequencyToHands(result.callFrequency) : shoveFrequencyToHands(result.shoveFrequency),
    };
  }

  const ranking = getPlayabilityRanking(matrix);
  if (!hasOpener) {
    if (activeSeat === "BB") return { source: "heuristic-approx", hands: generateBbVsLimpScenario(ranking) };
    if (activeSeat === "SB" && format.sbCanLimp) {
      return { source: "heuristic-approx", hands: generateSbFirstInScenario(ranking, effectiveStackBb) };
    }
    return {
      source: "heuristic-approx",
      hands: generateOpeningScenario(ranking, seatIndex(activeSeat), effectiveStackBb, firstInWidths),
    };
  }

  const isIP = postflopSeatIndex(activeSeat) > postflopSeatIndex(lastAggressor!);
  if (handsFacingRaise) {
    return {
      source: "heuristic-approx",
      hands: generateVsReraiseScenario(matrix, ranking, {
        heroRange,
        villainRange,
        isIP,
        potBb: potState.potBb,
        amountOwedBb,
        raiseWidth: shareOfCombos(villainRange) * format.threeBetWidthRatio * RAISE_VALUE_SHARE,
        rake: rake.structure,
      }),
    };
  }
  return {
    source: "heuristic-approx",
    hands: generateFacingRaiseScenario(ranking, {
      raiseDepth: potState.raiseDepth,
      isIP,
      potBb: potState.potBb,
      amountOwedBb,
      aggressorOpenWidth: openWidthFor(Math.min(seatIndex(lastAggressor!), 6), effectiveStackBb, firstInWidths),
      // BB's raise over a limp leaves SB closing the action, though BB sits "behind" it.
      seatsBehind: seatIndex(lastAggressor!) > seatIndex(activeSeat) ? 0 : SEAT_ORDER.length - 1 - seatIndex(activeSeat),
      threeBetWidthRatio: format.threeBetWidthRatio,
      coldCallBase: format.coldCallBase,
      continueFactor: Math.exp(-RAKE_CONTINUE_FALLOFF * rakeShare(rake.structure)),
    }),
  };
}
