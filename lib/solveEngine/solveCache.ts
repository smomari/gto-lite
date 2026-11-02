import type { EquityMatrix } from "@/lib/equity/loadEquityMatrix";
import { computePlayabilityRanking } from "@/lib/equity/handStrength";
import { solvePushFold, type PushFoldResult } from "@/lib/nashSolver/pushFoldSolver";
import { BB_ANTE_BB } from "./constants";
import { NO_RAKE_SETTINGS, type RakeSettings } from "./rake";

/**
 * Both results depend only on (matrix, stack, opponents behind, ante, rake), and the matrix is a
 * process-lifetime singleton — so /api/solve recomputes them at most once per
 * distinct input instead of on every request. Cached values are shared:
 * callers must treat them as read-only.
 */
const rankingByMatrix = new WeakMap<EquityMatrix, Map<string, number>>();
const pushFoldByMatrix = new WeakMap<EquityMatrix, Map<string, PushFoldResult>>();

export function getPlayabilityRanking(matrix: EquityMatrix): Map<string, number> {
  let ranking = rankingByMatrix.get(matrix);
  if (!ranking) {
    ranking = computePlayabilityRanking(matrix);
    rankingByMatrix.set(matrix, ranking);
  }
  return ranking;
}

export function getPushFoldResult(
  matrix: EquityMatrix,
  effectiveStackBb: number,
  opponentsBehind = 1,
  bbAnte = BB_ANTE_BB,
  rake: RakeSettings = NO_RAKE_SETTINGS,
): PushFoldResult {
  let bySpot = pushFoldByMatrix.get(matrix);
  if (!bySpot) {
    bySpot = new Map();
    pushFoldByMatrix.set(matrix, bySpot);
  }
  const key = `${effectiveStackBb}:${opponentsBehind}:${bbAnte}:${rake.structure.id}:${rake.noFlopNoDrop}`;
  let result = bySpot.get(key);
  if (!result) {
    result = solvePushFold(matrix, { effectiveStackBb, opponentsBehind, bbAnte, rake });
    bySpot.set(key, result);
  }
  return result;
}
