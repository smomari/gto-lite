import type { Position } from "@/types/rangeData";
import type { AvailableActions, CallOption } from "@/types/solveApi";
import { postflopSeatIndex, seatIndex } from "@/lib/actionTree/seatOrder";
import { reraiseSizesAt, type OpenSizeRange } from "./gameFormat";
import { callersOf, type PotState } from "./potState";
import {
  BIG_BLIND_BB,
  STACK_MAX_BB,
  LIMP_RAISE_TO_BB,
  NASH_FLAT_STACK_THRESHOLD_BB,
  OPEN_RAISE_SCALING_MIN_STACK_BB,
} from "./constants";

/** UTG, UTG1, LJ, HJ share a size; CO, BTN and SB each have their own. BB never opens. */
function openSizeFor(activeSeat: Position, potState: PotState): OpenSizeRange {
  const { openSizes } = potState.format;
  if (activeSeat === "SB") return openSizes.sb;
  if (activeSeat === "BTN") return openSizes.btn;
  return seatIndex(activeSeat) <= 3 ? openSizes.oop : openSizes.ip;
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
function interpolateOpenRaiseBb({ shallowBb, deepBb }: OpenSizeRange, effectiveStackBb: number): number {
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
    if (activeSeat === "BB") return LIMP_RAISE_TO_BB;
    return interpolateOpenRaiseBb(openSizeFor(activeSeat, potState), effectiveStackBb);
  }
  const isIP = postflopSeatIndex(activeSeat) > postflopSeatIndex(potState.lastAggressor);
  const { squeeze } = potState.format.reraiseSizes;
  const { threeBet, fourBetPlus } = reraiseSizesAt(potState.format, effectiveStackBb);
  const isBlind = activeSeat === "SB" || activeSeat === "BB";
  const callers = potState.raiseDepth === 1 && squeeze ? callersOf(potState, activeSeat).length : 0;
  const multiplier =
    potState.raiseDepth >= 2
      ? isIP ? fourBetPlus.ip : fourBetPlus.oop
      : callers > 0
        ? isBlind
          ? squeeze!.blind + (callers - 1) * squeeze!.perCaller
          : threeBet.ip + callers * squeeze!.perCaller
        : activeSeat === "BB" && potState.lastAggressor === "SB" && potState.format.reraiseSizes.bbOverSb !== undefined
          ? potState.format.reraiseSizes.bbOverSb
          : isIP ? threeBet.ip : activeSeat === "SB" ? threeBet.sbOop : threeBet.bbOop;
  // Round for the same reason interpolateOpenRaiseBb does — now that opening
  // sizes can be non-integer bb amounts, multiplying them by an integer
  // multiplier can still leak binary-float noise (e.g. 2.8 * 3 === 8.399999999999999).
  const raw = (potState.lastAggressorRaiseToBb ?? BIG_BLIND_BB) * multiplier;
  return Number(raw.toFixed(1));
}

/**
 * Only the blinds can enter an unraised pot: SB limps, or BB checks behind it.
 * Limping stops at the push/fold stacks, whose Nash ranges have no limp in them.
 */
function callOptionFor(
  activeSeat: Position,
  potState: PotState,
  effectiveStackBb: number,
  amountOwed: number,
): CallOption | null {
  if (potState.lastAggressor !== null) return { label: "Call", amountBb: amountOwed };
  if (activeSeat === "BB") return { label: "Check", amountBb: 0 };
  if (activeSeat === "SB" && potState.format.sbCanLimp && effectiveStackBb > NASH_FLAT_STACK_THRESHOLD_BB) {
    return { label: "Limp", amountBb: amountOwed };
  }
  return null;
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
  // At the push/fold stacks only Allin shows either: those charts have no smaller raise.
  const raise =
    effectiveStackBb > NASH_FLAT_STACK_THRESHOLD_BB && potState.currentBetToCall < raiseToCapped && raiseToCapped < effectiveStackBb
      ? { toBb: raiseToCapped }
      : null;

  const amountOwed = potState.currentBetToCall - (potState.committed[activeSeat] ?? 0);

  return {
    fold: !(potState.lastAggressor === null && activeSeat === "BB"),
    call: callOptionFor(activeSeat, potState, effectiveStackBb, amountOwed),
    raise,
    allin: potState.currentBetToCall < effectiveStackBb ? { toBb: effectiveStackBb } : null,
  };
}
