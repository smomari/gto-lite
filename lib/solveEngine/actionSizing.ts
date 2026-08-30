import type { Position } from "@/types/rangeData";
import type { AvailableActions } from "@/types/solveApi";
import { seatIndex } from "@/lib/actionTree/seatOrder";
import type { PotState } from "./potState";
import {
  BIG_BLIND_BB,
  OPEN_RAISE_OOP_MULTIPLIER,
  OPEN_RAISE_IP_MULTIPLIER,
  REACTIVE_RAISE_IP_MULTIPLIER,
  REACTIVE_RAISE_OOP_MULTIPLIER,
} from "./constants";

/** UTG, UTG1, LJ, HJ open OOP-sized; CO, BTN, SB open IP-sized. BB never opens. */
function isFirstHalf(seatIdx: number): boolean {
  return seatIdx <= 3;
}

/**
 * The raise-to size a seat would use if it raised right now, before capping
 * at the effective stack. Exported so replay.ts can recompute the canonical
 * size for a historical "raise" node using the state *as it was* at that step.
 */
export function computeRawRaiseTo(activeSeat: Position, potState: PotState): number {
  if (potState.lastAggressor === null) {
    const idx = seatIndex(activeSeat);
    const multiplier = isFirstHalf(idx) ? OPEN_RAISE_OOP_MULTIPLIER : OPEN_RAISE_IP_MULTIPLIER;
    return BIG_BLIND_BB * multiplier;
  }
  const isIP = seatIndex(activeSeat) > seatIndex(potState.lastAggressor);
  const multiplier = isIP ? REACTIVE_RAISE_IP_MULTIPLIER : REACTIVE_RAISE_OOP_MULTIPLIER;
  return (potState.lastAggressorRaiseToBb ?? BIG_BLIND_BB) * multiplier;
}

export function computeAvailableActions(
  activeSeat: Position,
  potState: PotState,
  effectiveStackBb: number,
): AvailableActions {
  const rawRaiseTo = computeRawRaiseTo(activeSeat, potState);
  const raiseToCapped = Math.min(rawRaiseTo, effectiveStackBb);

  // Show a distinct Raise button only if it's strictly between the current
  // bet and the full stack — otherwise it either isn't a legal raise at all
  // (degenerate short stack) or is identical to shoving, so only Allin shows.
  const raise =
    potState.currentBetToCall < raiseToCapped && raiseToCapped < effectiveStackBb
      ? { toBb: raiseToCapped }
      : null;

  const amountOwed = potState.currentBetToCall - (potState.committed[activeSeat] ?? 0);
  const call =
    potState.lastAggressor === null
      ? null
      : { label: (amountOwed === 0 ? "Check" : "Call") as "Check" | "Call", amountBb: amountOwed };

  return {
    fold: true,
    call,
    raise,
    allin: { toBb: effectiveStackBb },
  };
}
