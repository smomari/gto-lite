import { ALL_HANDS, TOTAL_COMBOS } from "@/lib/handRange/handList";
import type { EquityMatrix } from "@/lib/equity/loadEquityMatrix";
import { equityOf } from "@/lib/equity/loadEquityMatrix";
import { BB_ANTE_BB, BIG_BLIND_BB, SMALL_BLIND_BB } from "@/lib/solveEngine/constants";
import { NO_RAKE_SETTINGS, netPot, type RakeSettings } from "@/lib/solveEngine/rake";

export type FrequencyMap = Map<string, number>;

export function weightedEquityVsRange(
  matrix: EquityMatrix,
  hand: string,
  range: FrequencyMap,
): number {
  let weighted = 0;
  let totalWeight = 0;
  for (const villain of ALL_HANDS) {
    const freq = range.get(villain.hand) ?? 0;
    if (freq <= 0) continue;
    const weight = villain.combos * freq;
    weighted += equityOf(matrix, hand, villain.hand) * weight;
    totalWeight += weight;
  }
  if (totalWeight === 0) return NaN;
  return weighted / totalWeight;
}

function rangeWeight(range: FrequencyMap): number {
  let sum = 0;
  for (const h of ALL_HANDS) sum += (range.get(h.hand) ?? 0) * h.combos;
  return sum;
}

function allHandsAt(freq: number): FrequencyMap {
  return new Map(ALL_HANDS.map((h) => [h.hand, freq]));
}

export interface PushFoldParams {
  /** Effective stack in big blinds at the start of the hand, blinds included, assumed equal for hero and villain. */
  effectiveStackBb: number;
  smallBlind?: number;
  bigBlind?: number;
  /** Single BB-posted ante covering the whole table (the modern MTT convention), paid on top of the stack. */
  bbAnte?: number;
  /** The blind the shover already posted, part of its stack. Default the small blind: the SB shoving on the BB. */
  shoverPostedBb?: number;
  /** The blind the caller already posted, part of its stack. Default the big blind. */
  callerPostedBb?: number;
  /** Players left to act behind the shover, each of whom can call. Default 1: heads-up. */
  opponentsBehind?: number;
  /** A called shove sees a flop, so it always pays; the blinds pay only without no flop no drop. Default none. */
  rake?: RakeSettings;
  /** What each result is worth to the shover and the caller, in place of chips. Default: the chips themselves. */
  payoffs?: PushFoldPayoffs;
  maxIterations?: number;
}

/**
 * Each seat's value after every way the hand can end, on any scale: only the
 * differences are compared. A called shove is won or lost whole, so a hand's
 * value there is equity × win + (1 − equity) × lose.
 */
export interface PushFoldPayoffs {
  shover: { fold: number; steal: number; win: number; lose: number };
  caller: { fold: number; win: number; lose: number };
}

export interface PushFoldResult {
  /** Hero's shove (all-in) frequency per hand, 0..1. */
  shoveFrequency: FrequencyMap;
  /** Villain's call frequency per hand when facing hero's shove range, 0..1. */
  callFrequency: FrequencyMap;
  iterations: number;
  converged: boolean;
}

const DAMPING = 0.1;
const CONVERGENCE_EPSILON = 0.05;
/**
 * Spots that converge do so within about 120 iterations. A few deep ones (7 of
 * 49 from 25–100bb) settle into a small cycle instead, where 2000 iterations
 * were no better than 300 — about 0.3–1.2 points of total range either way —
 * and took 4.5s, on a request path.
 */
const MAX_ITERATIONS = 300;

/**
 * Fixed-point best-response solve for a 2-player shove/fold subgame, updating
 * both sides simultaneously with a damping factor. A plain full-jump best
 * response (no damping) provably overshoots on this game — a narrow shoving
 * range makes calling unprofitable, which collapses the call range to empty,
 * which makes shoving with literally everything the best response, which
 * makes calling profitable again — an infinite boom-bust loop. Damping each
 * update by `DAMPING` suppresses that boom-bust cycle; a light damping factor
 * (e.g. 0.5) still leaves a correlated cluster of close, blocker-sensitive
 * hands (e.g. K7s-K2s) oscillating, so `DAMPING` is deliberately small — this
 * costs iterations but reliably collapses the equilibrium down to a clean
 * threshold with only a handful of genuinely near-indifferent hands left
 * mixed, matching the shape of real published push/fold charts.
 *
 * Chip EV unless `payoffs` say otherwise. A blind the shover or caller posted
 * is part of its stack: folding loses it, and a called shove is both stacks plus
 * the ante and any third seat's blind. The steal wins every blind and the ante.
 *
 * `opponentsBehind` is what separates UTG from the SB: the shove only takes
 * the dead money if all of them fold. Each calls independently with the same
 * range, and a called shove is played against one caller — multiway all-ins
 * aren't modeled, nor do callers tighten for players still behind them.
 */
export function solvePushFold(
  matrix: EquityMatrix,
  params: PushFoldParams,
): PushFoldResult {
  const {
    effectiveStackBb: S,
    smallBlind = SMALL_BLIND_BB,
    bigBlind = BIG_BLIND_BB,
    bbAnte = BB_ANTE_BB,
    shoverPostedBb = smallBlind,
    callerPostedBb = bigBlind,
    opponentsBehind = 1,
    rake = NO_RAKE_SETTINGS,
    payoffs,
    maxIterations = MAX_ITERATIONS,
  } = params;
  const pot = smallBlind + bigBlind + bbAnte;
  const deadMoney = rake.noFlopNoDrop ? pot : netPot(pot, rake.structure);
  const potIfCalled = netPot(2 * S + pot - shoverPostedBb - callerPostedBb, rake.structure);
  // Without payoffs the chips are the values: each risks what it hasn't posted yet.
  const callEv = (equity: number) =>
    payoffs
      ? equity * payoffs.caller.win + (1 - equity) * payoffs.caller.lose - payoffs.caller.fold
      : equity * potIfCalled - (S - callerPostedBb);
  const shownDownEv = (equity: number) =>
    payoffs
      ? equity * payoffs.shover.win + (1 - equity) * payoffs.shover.lose - payoffs.shover.fold
      : equity * potIfCalled - (S - shoverPostedBb);
  const stealEv = payoffs ? payoffs.shover.steal - payoffs.shover.fold : deadMoney;

  let shoveRange: FrequencyMap = allHandsAt(1);
  let callRange: FrequencyMap = allHandsAt(0.5);

  let converged = false;
  let iterations = 0;

  for (let i = 1; i <= maxIterations; i++) {
    iterations = i;

    const shoveWeight = rangeWeight(shoveRange);
    const callBestResponse: FrequencyMap = new Map();
    for (const h of ALL_HANDS) {
      const ev =
        shoveWeight === 0
          ? -1
          : callEv(weightedEquityVsRange(matrix, h.hand, shoveRange));
      callBestResponse.set(h.hand, ev > 0 ? 1 : 0);
    }

    const callProb = rangeWeight(callRange) / TOTAL_COMBOS;
    const allFoldProb = Math.pow(1 - callProb, opponentsBehind);
    const shoveBestResponse: FrequencyMap = new Map();
    for (const h of ALL_HANDS) {
      const ev =
        callProb === 0
          ? stealEv
          : allFoldProb * stealEv + (1 - allFoldProb) * shownDownEv(weightedEquityVsRange(matrix, h.hand, callRange));
      shoveBestResponse.set(h.hand, ev > 0 ? 1 : 0);
    }

    let maxChange = 0;
    const nextShoveRange: FrequencyMap = new Map();
    for (const h of ALL_HANDS) {
      const prev = shoveRange.get(h.hand) ?? 0;
      const next = prev * (1 - DAMPING) + (shoveBestResponse.get(h.hand) ?? 0) * DAMPING;
      maxChange = Math.max(maxChange, Math.abs(next - prev));
      nextShoveRange.set(h.hand, next);
    }
    const nextCallRange: FrequencyMap = new Map();
    for (const h of ALL_HANDS) {
      const prev = callRange.get(h.hand) ?? 0;
      const next = prev * (1 - DAMPING) + (callBestResponse.get(h.hand) ?? 0) * DAMPING;
      maxChange = Math.max(maxChange, Math.abs(next - prev));
      nextCallRange.set(h.hand, next);
    }

    shoveRange = nextShoveRange;
    callRange = nextCallRange;

    if (maxChange < CONVERGENCE_EPSILON) {
      converged = true;
      break;
    }
  }

  return {
    shoveFrequency: shoveRange,
    callFrequency: callRange,
    iterations,
    converged,
  };
}
