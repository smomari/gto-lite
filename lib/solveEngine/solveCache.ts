import type { EquityMatrix } from "@/lib/equity/loadEquityMatrix";
import { computePercentileRanking } from "@/lib/equity/handStrength";
import { solvePushFold, type PushFoldResult } from "@/lib/nashSolver/pushFoldSolver";

/**
 * Both results depend only on (matrix, stack), and the matrix is a
 * process-lifetime singleton — so /api/solve recomputes them at most once per
 * distinct input instead of on every request. Cached values are shared:
 * callers must treat them as read-only.
 */
const rankingByMatrix = new WeakMap<EquityMatrix, Map<string, number>>();
const pushFoldByMatrix = new WeakMap<EquityMatrix, Map<number, PushFoldResult>>();

export function getPercentileRanking(matrix: EquityMatrix): Map<string, number> {
  let ranking = rankingByMatrix.get(matrix);
  if (!ranking) {
    ranking = computePercentileRanking(matrix);
    rankingByMatrix.set(matrix, ranking);
  }
  return ranking;
}

export function getPushFoldResult(matrix: EquityMatrix, effectiveStackBb: number): PushFoldResult {
  let byStack = pushFoldByMatrix.get(matrix);
  if (!byStack) {
    byStack = new Map();
    pushFoldByMatrix.set(matrix, byStack);
  }
  let result = byStack.get(effectiveStackBb);
  if (!result) {
    result = solvePushFold(matrix, { effectiveStackBb });
    byStack.set(effectiveStackBb, result);
  }
  return result;
}
