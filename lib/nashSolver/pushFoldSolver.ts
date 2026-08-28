import { ALL_HANDS } from "@/lib/handRange/handList";
import type { EquityMatrix } from "@/lib/equity/loadEquityMatrix";
import { equityOf } from "@/lib/equity/loadEquityMatrix";

export type FrequencyMap = Map<string, number>;

const TOTAL_COMBOS = ALL_HANDS.reduce((sum, h) => sum + h.combos, 0);

function weightedEquityVsRange(
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
  /** Effective stack in big blinds, assumed equal for hero and villain. */
  effectiveStackBb: number;
  smallBlind?: number;
  bigBlind?: number;
  maxIterations?: number;
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
 * Chip-EV only (no ICM); models the pot as both effective stacks plus the two
 * blinds as dead money — an accepted MVP-level simplification of the exact
 * seats/antes involved in any real hand.
 */
export function solvePushFold(
  matrix: EquityMatrix,
  params: PushFoldParams,
): PushFoldResult {
  const {
    effectiveStackBb: S,
    smallBlind = 0.5,
    bigBlind = 1,
    maxIterations = 2000,
  } = params;
  const deadMoney = smallBlind + bigBlind;
  const potIfCalled = 2 * S + deadMoney;

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
          : weightedEquityVsRange(matrix, h.hand, shoveRange) * potIfCalled - S;
      callBestResponse.set(h.hand, ev > 0 ? 1 : 0);
    }

    const callProb = rangeWeight(callRange) / TOTAL_COMBOS;
    const shoveBestResponse: FrequencyMap = new Map();
    for (const h of ALL_HANDS) {
      const ev =
        callProb === 0
          ? deadMoney
          : (1 - callProb) * deadMoney +
            callProb * (weightedEquityVsRange(matrix, h.hand, callRange) * potIfCalled - S);
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
