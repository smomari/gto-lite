/**
 * 2-player postflop pot ledger for a single street. Much simpler than the
 * preflop 8-seat rotation (lib/solveEngine/rotation.ts): postflop is always
 * exactly 2 live players by the time it's reached (Phase 1 doesn't support
 * multiway), so a dedicated rotation state machine isn't needed;
 * treeBuilder.ts walks the (small, fixed-shape) turn order directly.
 */

/** P1 acts first this street (the seat with the lower preflop seat-order index, i.e. OOP). */
export type PostflopPlayer = "P1" | "P2";
export type PostflopActionType = "fold" | "check" | "call" | "bet" | "raise" | "allin";

export interface PostflopPotState {
  /** Pot size entering this street — fixed dead money from before, neither player reclaims it by folding. */
  startPot: number;
  /** Chips each player has committed THIS street. */
  committed: { P1: number; P2: number };
  /** Amount the acting player must add to match (0 if no bet yet this street). */
  currentBetToCall: number;
  lastAggressor: PostflopPlayer | null;
  lastActor: PostflopPlayer | null;
  /** How many times a bet has been raised this street — see betAbstraction.ts's RAISE_CAP. */
  raiseCount: number;
}

export function initialPostflopPotState(startPot: number): PostflopPotState {
  return {
    startPot,
    committed: { P1: 0, P2: 0 },
    currentBetToCall: 0,
    lastAggressor: null,
    lastActor: null,
    raiseCount: 0,
  };
}

export function otherPlayer(p: PostflopPlayer): PostflopPlayer {
  return p === "P1" ? "P2" : "P1";
}

export function totalPot(state: PostflopPotState): number {
  return state.startPot + state.committed.P1 + state.committed.P2;
}

export interface ApplyPostflopActionOptions {
  effectiveStackBb: number;
  /** Required for "bet"/"raise" — the resulting total committed this street after the action. */
  betToBb?: number;
}

/** Pure state transition. Does not decide bet sizes — see betAbstraction.ts. */
export function applyPostflopAction(
  state: PostflopPotState,
  actor: PostflopPlayer,
  action: PostflopActionType,
  options: ApplyPostflopActionOptions,
): PostflopPotState {
  const { effectiveStackBb, betToBb } = options;

  switch (action) {
    case "fold":
    case "check":
      return { ...state, lastActor: actor };

    case "call":
      return {
        ...state,
        committed: { ...state.committed, [actor]: state.currentBetToCall },
        lastActor: actor,
      };

    case "bet": {
      if (betToBb === undefined) {
        throw new Error("applyPostflopAction: betToBb is required for a bet or raise action");
      }
      return {
        ...state,
        committed: { ...state.committed, [actor]: betToBb },
        currentBetToCall: betToBb,
        lastAggressor: actor,
        lastActor: actor,
      };
    }

    case "raise": {
      if (betToBb === undefined) {
        throw new Error("applyPostflopAction: betToBb is required for a bet or raise action");
      }
      return {
        ...state,
        committed: { ...state.committed, [actor]: betToBb },
        currentBetToCall: betToBb,
        lastAggressor: actor,
        lastActor: actor,
        raiseCount: state.raiseCount + 1,
      };
    }

    case "allin": {
      const isGenuineAggression = effectiveStackBb > state.currentBetToCall;
      return {
        ...state,
        committed: { ...state.committed, [actor]: effectiveStackBb },
        currentBetToCall: Math.max(state.currentBetToCall, effectiveStackBb),
        lastAggressor: isGenuineAggression ? actor : state.lastAggressor,
        lastActor: actor,
      };
    }
  }
}
