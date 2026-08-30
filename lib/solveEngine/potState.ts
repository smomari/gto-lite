import type { ActionType, Position } from "@/types/rangeData";
import { SMALL_BLIND_BB, BIG_BLIND_BB, BB_ANTE_BB } from "./constants";

export interface PotState {
  /** Cumulative chips each seat has put in so far (blinds + calls + raises; ante excluded here). */
  committed: Partial<Record<Position, number>>;
  foldedSeats: Set<Position>;
  /** committed sum + the BB ante. */
  potBb: number;
  /** The amount a seat must match to call (the current bet-to amount). */
  currentBetToCall: number;
  lastAggressor: Position | null;
  lastAggressorRaiseToBb: number | null;
  /** Count of raise/allin-as-raise events in the hand so far. */
  raiseDepth: number;
  /** Seat whose action was applied most recently; null before the hand starts. */
  lastActor: Position | null;
}

export function initialPotState(): PotState {
  return {
    committed: { SB: SMALL_BLIND_BB, BB: BIG_BLIND_BB },
    foldedSeats: new Set(),
    potBb: SMALL_BLIND_BB + BIG_BLIND_BB + BB_ANTE_BB,
    currentBetToCall: BIG_BLIND_BB,
    lastAggressor: null,
    lastAggressorRaiseToBb: null,
    raiseDepth: 0,
    lastActor: null,
  };
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
      const delta = effectiveStackBb - prevCommitted;
      const isGenuineRaise = effectiveStackBb > state.currentBetToCall;
      return {
        ...state,
        committed: { ...state.committed, [actor]: effectiveStackBb },
        potBb: state.potBb + delta,
        currentBetToCall: isGenuineRaise ? effectiveStackBb : state.currentBetToCall,
        lastAggressor: isGenuineRaise ? actor : state.lastAggressor,
        lastAggressorRaiseToBb: isGenuineRaise ? effectiveStackBb : state.lastAggressorRaiseToBb,
        raiseDepth: isGenuineRaise ? state.raiseDepth + 1 : state.raiseDepth,
        lastActor: actor,
      };
    }
  }
}
