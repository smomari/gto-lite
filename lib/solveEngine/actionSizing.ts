import type { Position } from "@/types/rangeData";
import type { AvailableActions } from "@/types/solveApi";
import { seatIndex } from "@/lib/actionTree/seatOrder";
import type { PotState } from "./potState";
import {
  BIG_BLIND_BB,
  STACK_MAX_BB,
  OPEN_RAISE_SCALING_MIN_STACK_BB,
  OPEN_RAISE_IP_SHALLOW_BB,
  OPEN_RAISE_IP_DEEP_BB,
  OPEN_RAISE_OOP_SHALLOW_BB,
  OPEN_RAISE_OOP_DEEP_BB,
  REACTIVE_RAISE_IP_MULTIPLIER,
  REACTIVE_RAISE_OOP_MULTIPLIER,
} from "./constants";

/** UTG, UTG1, LJ, HJ open OOP-sized; CO, BTN, SB open IP-sized. BB never opens. */
function isFirstHalf(seatIdx: number): boolean {
  return seatIdx <= 3;
}

/**
 * Linearly interpolates an opening raise-to size between its shallow-stack
 * value (flat at/below OPEN_RAISE_SCALING_MIN_STACK_BB) and its deep-stack
 * value (reached at STACK_MAX_BB), clamping effectiveStackBb into that range
 * first. Rounds via toFixed (not a divide/multiply-by-a-unit trick, which
 * leaks binary-float noise like 2.4000000000000004 — verified directly) to
 * 1 decimal place, since callers — including the UI, which renders these
 * numbers with no further formatting — must never see raw float noise.
 */
function interpolateOpenRaiseBb(shallowBb: number, deepBb: number, effectiveStackBb: number): number {
  const clampedStack = Math.min(Math.max(effectiveStackBb, OPEN_RAISE_SCALING_MIN_STACK_BB), STACK_MAX_BB);
  const t = (clampedStack - OPEN_RAISE_SCALING_MIN_STACK_BB) / (STACK_MAX_BB - OPEN_RAISE_SCALING_MIN_STACK_BB);
  const raw = shallowBb + t * (deepBb - shallowBb);
  return Number(raw.toFixed(1));
}

/**
 * The raise-to size a seat would use if it raised right now, before capping
 * at the effective stack. Exported for direct unit testing in
 * actionSizing.test.ts; the only production call site is
 * computeAvailableActions below (NOT replay.ts, which only reaches this
 * indirectly via computeAvailableActions).
 */
export function computeRawRaiseTo(
  activeSeat: Position,
  potState: PotState,
  effectiveStackBb: number,
): number {
  if (potState.lastAggressor === null) {
    const idx = seatIndex(activeSeat);
    return isFirstHalf(idx)
      ? interpolateOpenRaiseBb(OPEN_RAISE_OOP_SHALLOW_BB, OPEN_RAISE_OOP_DEEP_BB, effectiveStackBb)
      : interpolateOpenRaiseBb(OPEN_RAISE_IP_SHALLOW_BB, OPEN_RAISE_IP_DEEP_BB, effectiveStackBb);
  }
  const isIP = seatIndex(activeSeat) > seatIndex(potState.lastAggressor);
  const multiplier = isIP ? REACTIVE_RAISE_IP_MULTIPLIER : REACTIVE_RAISE_OOP_MULTIPLIER;
  // Round for the same reason interpolateOpenRaiseBb does — now that opening
  // sizes can be non-integer bb amounts, multiplying them by an integer
  // multiplier can still leak binary-float noise (e.g. 2.8 * 3 === 8.399999999999999).
  const raw = (potState.lastAggressorRaiseToBb ?? BIG_BLIND_BB) * multiplier;
  return Number(raw.toFixed(1));
}

export function computeAvailableActions(
  activeSeat: Position,
  potState: PotState,
  effectiveStackBb: number,
): AvailableActions {
  const rawRaiseTo = computeRawRaiseTo(activeSeat, potState, effectiveStackBb);
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
