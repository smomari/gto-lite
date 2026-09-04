import type { PostflopPlayer, PostflopPotState } from "./potState";
import { totalPot } from "./potState";

export type PostflopStreet = "flop" | "turn" | "river";

export interface StreetBetSizing {
  /** Opening-bet sizes, as a fraction of the pot at the moment of betting. */
  betPotFractions: number[];
  /** Raise sizes, as a fraction of "pot after calling the current bet" — see computeRaiseTo. */
  raisePotFractions: number[];
}

/**
 * Phase A's bet-size menu, one step up from Phase 1's single fixed size.
 * Sizes follow the scheme actually used by the open-source shark-2.0 solver:
 * the flop (the most expensive street to solve, since it's revisited for
 * every possible turn/river) gets fewer sizes than turn/river.
 */
export const BET_SIZING: Record<PostflopStreet, StreetBetSizing> = {
  flop: { betPotFractions: [0.5, 1.0], raisePotFractions: [1.0] },
  turn: { betPotFractions: [0.33, 0.66, 1.0], raisePotFractions: [0.5, 1.0] },
  river: { betPotFractions: [0.33, 0.66, 1.0], raisePotFractions: [0.5, 1.0] },
};

/** How many times a bet may be raised, this street. Beyond this, only fold/call remain. */
export const RAISE_CAP = 1;

export function streetForBoardLength(boardLength: number): PostflopStreet {
  if (boardLength === 3) return "flop";
  if (boardLength === 4) return "turn";
  if (boardLength === 5) return "river";
  throw new Error(`streetForBoardLength: unexpected board length ${boardLength}`);
}

export interface PostflopAvailableActions {
  fold: boolean;
  check: boolean;
  call: { amountBb: number } | null;
  bet: { toBb: number }[];
  raise: { toBb: number }[];
  /** Always null once a bet has already been raised the maximum number of times this street. */
  allin: { toBb: number } | null;
}

/**
 * Turns a list of pot-fraction candidates into concrete `{toBb}` options,
 * dropping any that collapse into (or exceed) an all-in — `allin` is always
 * offered as its own separate option, so a size that reaches the same total
 * would just be a redundant duplicate of it — and de-duplicating amounts
 * that clamp to the same number of bb.
 */
function candidateSizes(
  potFractions: number[],
  computeToBb: (fraction: number) => number,
  effectiveStackBb: number,
): { toBb: number }[] {
  const seen = new Set<number>();
  const result: { toBb: number }[] = [];
  for (const frac of potFractions) {
    const toBb = Math.min(computeToBb(frac), effectiveStackBb);
    if (toBb >= effectiveStackBb) continue;
    if (seen.has(toBb)) continue;
    seen.add(toBb);
    result.push({ toBb });
  }
  return result;
}

/**
 * Standard "pot-sized raise" math: `fraction` of the pot *after calling* the
 * current bet, added on top of that call. E.g. a villain bet of X into a pot
 * of P (so the pot is now P+X): calling brings the pot to P+2X, and a full
 * (fraction=1) pot raise adds that much again, for a total raise-to of
 * X + (P+2X) = P+3X — the standard definition used by TexasSolver/shark-2.0.
 */
function computeRaiseTo(state: PostflopPotState, actor: PostflopPlayer, fraction: number): number {
  const alreadyCommitted = state.committed[actor];
  const toCall = state.currentBetToCall - alreadyCommitted;
  const potAfterCall = totalPot(state) + toCall;
  return state.currentBetToCall + fraction * potAfterCall;
}

/**
 * Phase A's bet abstraction: multiple bet sizes (per street) when opening
 * the action, plus a single round of raising (also multiple sizes) when
 * facing a bet — capped at RAISE_CAP re-raises, after which only fold/call
 * remain (mirroring Phase 1's original "no re-raising" facing-a-bet menu,
 * now reached one aggressive action later).
 */
export function computePostflopAvailableActions(
  state: PostflopPotState,
  actor: PostflopPlayer,
  effectiveStackBb: number,
  street: PostflopStreet,
): PostflopAvailableActions {
  const alreadyCommitted = state.committed[actor];
  const remaining = effectiveStackBb - alreadyCommitted;
  const facingBet = state.currentBetToCall > alreadyCommitted;
  const sizing = BET_SIZING[street];

  if (!facingBet) {
    const pot = totalPot(state);
    const bets =
      remaining > 0
        ? candidateSizes(sizing.betPotFractions, (frac) => alreadyCommitted + pot * frac, effectiveStackBb)
        : [];
    return {
      fold: false,
      check: true,
      call: null,
      bet: bets,
      raise: [],
      allin: remaining > 0 ? { toBb: effectiveStackBb } : null,
    };
  }

  const amountOwed = state.currentBetToCall - alreadyCommitted;
  const callAmount = Math.min(amountOwed, remaining);
  const capReached = state.raiseCount >= RAISE_CAP;
  // Once calling would already commit the actor's whole remaining stack
  // (e.g. the current bet is itself an all-in, since both stacks are equal),
  // there's no room for a distinct, more-aggressive raise/allin — call
  // already covers it, so offering a separate allin would just be a
  // redundant duplicate action reaching the same resulting state.
  const hasRaiseRoom = remaining > amountOwed;

  const raises =
    !capReached && hasRaiseRoom
      ? candidateSizes(sizing.raisePotFractions, (frac) => computeRaiseTo(state, actor, frac), effectiveStackBb)
      : [];

  return {
    fold: true,
    check: false,
    call: remaining > 0 ? { amountBb: callAmount } : null,
    bet: [],
    raise: raises,
    allin: !capReached && hasRaiseRoom ? { toBb: effectiveStackBb } : null,
  };
}
