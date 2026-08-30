import type { HandFrequency, Position, RangeSource } from "@/types/rangeData";
import type { EquityMatrix } from "@/lib/equity/loadEquityMatrix";
import { computePercentileRanking } from "@/lib/equity/handStrength";
import { ALL_HANDS } from "@/lib/handRange/handList";
import { seatIndex } from "@/lib/actionTree/seatOrder";
import { solvePushFold } from "@/lib/nashSolver/pushFoldSolver";
import { generateOpeningScenario, generateFacingRaiseScenario } from "@/lib/heuristicRanges/generateScenario";
import type { PotState } from "./potState";
import { shouldUseNash } from "./classify";

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
    const result = solvePushFold(matrix, { effectiveStackBb: remainingStackBb });
    return {
      source: "nash-shove-fold",
      hands: hasOpener ? callFrequencyToHands(result.callFrequency) : shoveFrequencyToHands(result.shoveFrequency),
    };
  }

  const ranking = computePercentileRanking(matrix);
  if (!hasOpener) {
    return { source: "heuristic-approx", hands: generateOpeningScenario(ranking, seatIndex(activeSeat)) };
  }

  const lastAggressor = potState.lastAggressor!;
  const amountOwedBb = potState.currentBetToCall - (potState.committed[activeSeat] ?? 0);
  return {
    source: "heuristic-approx",
    hands: generateFacingRaiseScenario(ranking, {
      raiseDepth: potState.raiseDepth,
      isIP: seatIndex(activeSeat) > seatIndex(lastAggressor),
      potBb: potState.potBb,
      amountOwedBb,
    }),
  };
}
