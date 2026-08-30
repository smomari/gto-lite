import type { PostflopPlayer, PostflopPotState } from "./potState";
import { totalPot } from "./potState";

/** Phase 1's minimal bet-size menu: a single pot-fraction bet, no re-raising. */
export const BET_POT_FRACTION = 0.66;

export interface PostflopAvailableActions {
  fold: boolean;
  check: boolean;
  call: { amountBb: number } | null;
  bet: { toBb: number } | null;
  /** Always null when facing a bet — Phase 1 caps action at one aggressive act per street; calling already covers the short-stack call-for-less case. */
  allin: { toBb: number } | null;
}

/**
 * Phase 1's bet abstraction. Deliberately the smallest non-degenerate menu
 * (per the plan): Check | Bet 66% pot | Allin when opening the action; Fold |
 * Call when facing a bet (call is capped at the caller's own remaining stack,
 * i.e. becomes a call-all-in when short — there is no separate "raise" or
 * "allin" option once facing a bet, so no street can ever see more than one
 * aggressive action). This keeps the whole street's tree tiny and bounded,
 * which is the point of Phase 1: get one fully-correct pipeline working
 * before growing the menu (Phase 1.5).
 */
export function computePostflopAvailableActions(
  state: PostflopPotState,
  actor: PostflopPlayer,
  effectiveStackBb: number,
): PostflopAvailableActions {
  const alreadyCommitted = state.committed[actor];
  const remaining = effectiveStackBb - alreadyCommitted;
  const facingBet = state.currentBetToCall > alreadyCommitted;

  if (!facingBet) {
    const rawBet = totalPot(state) * BET_POT_FRACTION;
    const betToBb = alreadyCommitted + Math.min(rawBet, remaining);
    const betIsAllin = betToBb >= effectiveStackBb;
    return {
      fold: false,
      check: true,
      call: null,
      bet: remaining > 0 && !betIsAllin ? { toBb: betToBb } : null,
      allin: remaining > 0 ? { toBb: effectiveStackBb } : null,
    };
  }

  const amountOwed = state.currentBetToCall - alreadyCommitted;
  const callAmount = Math.min(amountOwed, remaining);
  return {
    fold: true,
    check: false,
    call: remaining > 0 ? { amountBb: callAmount } : null,
    bet: null,
    allin: null,
  };
}
