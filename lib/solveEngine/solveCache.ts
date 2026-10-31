import type { EquityMatrix } from "@/lib/equity/loadEquityMatrix";
import { computePercentileRanking } from "@/lib/equity/handStrength";
import { solvePushFold, type PushFoldResult } from "@/lib/nashSolver/pushFoldSolver";

/**
 * Both results depend only on (matrix, stack, opponents behind), and the matrix is a
 * process-lifetime singleton — so /api/solve recomputes them at most once per
 * distinct input instead of on every request. Cached values are shared:
 * callers must treat them as read-only.
 */
const rankingByMatrix = new WeakMap<EquityMatrix, Map<string, number>>();
const pushFoldByMatrix = new WeakMap<EquityMatrix, Map<string, PushFoldResult>>();

export function getPercentileRanking(matrix: EquityMatrix): Map<string, number> {
  let ranking = rankingByMatrix.get(matrix);
  if (!ranking) {
    ranking = computePercentileRanking(matrix);
    rankingByMatrix.set(matrix, ranking);
  }
  return ranking;
}

export function getPushFoldResult(matrix: EquityMatrix, effectiveStackBb: number, opponentsBehind = 1): PushFoldResult {
  let bySpot = pushFoldByMatrix.get(matrix);
  if (!bySpot) {
    bySpot = new Map();
    pushFoldByMatrix.set(matrix, bySpot);
  }
  const key = `${effectiveStackBb}:${opponentsBehind}`;
  let result = bySpot.get(key);
  if (!result) {
    result = solvePushFold(matrix, { effectiveStackBb, opponentsBehind });
    bySpot.set(key, result);
  }
  return result;
}
