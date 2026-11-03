import type { ActionType, Position } from "@/types/rangeData";
import { SEAT_ORDER } from "@/lib/actionTree/seatOrder";
import { SMALL_BLIND_BB, BIG_BLIND_BB } from "./constants";
import { TOURNAMENT_8, type GameFormat } from "./gameFormat";

export interface PotState {
  format: GameFormat;
  /** Cumulative chips each seat has put in so far (blinds + calls + raises; ante excluded here). */
  committed: Partial<Record<Position, number>>;
  foldedSeats: Set<Position>;
  /** committed sum + any BB ante. */
  potBb: number;
  /** The amount a seat must match to call (the current bet-to amount). */
  currentBetToCall: number;
  lastAggressor: Position | null;
  lastAggressorRaiseToBb: number | null;
  /** Count of raise/allin-as-raise events in the hand so far. */
  raiseDepth: number;
  /** Seat whose action was applied most recently; null before the hand starts. */
  lastActor: Position | null;
  /** Each seat's latest decision: the state it faced and what it chose. Its range can be rebuilt from these. */
  lastDecision: Partial<Record<Position, SeatDecision>>;
}

export interface SeatDecision {
  state: PotState;
  action: ActionType;
}

export function initialPotState(format: GameFormat = TOURNAMENT_8): PotState {
  return {
    format,
    committed: { SB: SMALL_BLIND_BB, BB: BIG_BLIND_BB },
    foldedSeats: new Set(format.absentSeats),
    potBb: SMALL_BLIND_BB + BIG_BLIND_BB + format.bbAnteBb,
    currentBetToCall: BIG_BLIND_BB,
    lastAggressor: null,
    lastAggressorRaiseToBb: null,
    raiseDepth: 0,
    lastActor: null,
    lastDecision: {},
  };
}

/** Seats that called the current raise: live, not its raiser, and level with it. `except` is left out too. */
export function callersOf(state: PotState, except: Position): Position[] {
  if (state.lastAggressor === null) return [];
  return SEAT_ORDER.filter(
    (seat) =>
      seat !== except &&
      seat !== state.lastAggressor &&
      !state.foldedSeats.has(seat) &&
      state.committed[seat] === state.currentBetToCall,
  );
}

export interface ApplyActionOptions {
  effectiveStackBb: number;
  /** Required for `action === "raise"` — the raise-to amount, decided by actionSizing.ts. */
  raiseToBb?: number;
}

/**
 * Applies one seat's action to the pot ledger. Pure state transition — does
 * NOT decide raise sizes (that's actionSizing.ts's job); the caller must
 * supply `raiseToBb` for a "raise" action, already validated/capped.
 */
export function applyAction(
  state: PotState,
  actor: Position,
  action: ActionType,
  options: ApplyActionOptions,
): PotState {
  return {
    ...settleAction(state, actor, action, options),
    lastDecision: { ...state.lastDecision, [actor]: { state, action } },
  };
}

function settleAction(
  state: PotState,
  actor: Position,
  action: ActionType,
  options: ApplyActionOptions,
): PotState {
  const { effectiveStackBb } = options;
  const prevCommitted = state.committed[actor] ?? 0;

  switch (action) {
    case "fold":
      return {
        ...state,
        foldedSeats: new Set([...state.foldedSeats, actor]),
        lastActor: actor,
      };

    case "call": {
      const amount = state.currentBetToCall - prevCommitted;
      return {
        ...state,
        committed: { ...state.committed, [actor]: state.currentBetToCall },
        potBb: state.potBb + amount,
        lastActor: actor,
      };
    }

    case "raise": {
      if (options.raiseToBb === undefined) {
        throw new Error("applyAction: raiseToBb is required for a raise action");
      }
      const raiseTo = options.raiseToBb;
      const delta = raiseTo - prevCommitted;
      return {
        ...state,
        committed: { ...state.committed, [actor]: raiseTo },
        potBb: state.potBb + delta,
        currentBetToCall: raiseTo,
        lastAggressor: actor,
        lastAggressorRaiseToBb: raiseTo,
        raiseDepth: state.raiseDepth + 1,
        lastActor: actor,
      };
    }

    case "allin": {
      // Every seat has the same stack, and replay turns an all-in that can't raise into a call.
      return {
        ...state,
        committed: { ...state.committed, [actor]: effectiveStackBb },
        potBb: state.potBb + effectiveStackBb - prevCommitted,
        currentBetToCall: effectiveStackBb,
        lastAggressor: actor,
        lastAggressorRaiseToBb: effectiveStackBb,
        raiseDepth: state.raiseDepth + 1,
        lastActor: actor,
      };
    }
  }
}
