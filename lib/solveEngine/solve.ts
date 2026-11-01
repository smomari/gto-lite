import type { HandFrequency, Position, RangeSource } from "@/types/rangeData";
import type { EquityMatrix } from "@/lib/equity/loadEquityMatrix";
import { ALL_HANDS } from "@/lib/handRange/handList";
import { SEAT_ORDER, postflopSeatIndex, seatIndex } from "@/lib/actionTree/seatOrder";
import {
  generateBbVsLimpScenario,
  generateFacingRaiseScenario,
  generateOpeningScenario,
  generateSbFirstInScenario,
  openWidthFor,
} from "@/lib/heuristicRanges/generateScenario";
import type { PotState } from "./potState";
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
): SolvedNode {
  const hasOpener = potState.raiseDepth >= 1;
  const remainingStackBb = effectiveStackBb - (potState.committed[activeSeat] ?? 0);

  if (shouldUseNash(effectiveStackBb, remainingStackBb, potState.potBb, hasOpener)) {
    const shover = potState.lastAggressor ?? activeSeat;
    const opponentsBehind = Math.max(1, SEAT_ORDER.length - 1 - seatIndex(shover));
    const result = getPushFoldResult(matrix, remainingStackBb, opponentsBehind);
    return {
      source: "nash-shove-fold",
      hands: hasOpener ? callFrequencyToHands(result.callFrequency) : shoveFrequencyToHands(result.shoveFrequency),
    };
  }

  const ranking = getPlayabilityRanking(matrix);
  if (!hasOpener) {
    if (activeSeat === "BB") return { source: "heuristic-approx", hands: generateBbVsLimpScenario(ranking) };
    if (activeSeat === "SB") return { source: "heuristic-approx", hands: generateSbFirstInScenario(ranking, effectiveStackBb) };
    return { source: "heuristic-approx", hands: generateOpeningScenario(ranking, seatIndex(activeSeat), effectiveStackBb) };
  }

  const lastAggressor = potState.lastAggressor!;
  const amountOwedBb = potState.currentBetToCall - (potState.committed[activeSeat] ?? 0);
  return {
    source: "heuristic-approx",
    hands: generateFacingRaiseScenario(ranking, {
      raiseDepth: potState.raiseDepth,
      isIP: postflopSeatIndex(activeSeat) > postflopSeatIndex(lastAggressor),
      potBb: potState.potBb,
      amountOwedBb,
      aggressorOpenWidth: openWidthFor(Math.min(seatIndex(lastAggressor), 6), effectiveStackBb),
      // BB's raise over a limp leaves SB closing the action, though BB sits "behind" it.
      seatsBehind: seatIndex(lastAggressor) > seatIndex(activeSeat) ? 0 : SEAT_ORDER.length - 1 - seatIndex(activeSeat),
    }),
  };
}
