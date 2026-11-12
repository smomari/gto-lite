import type { EquityMatrix } from "@/lib/equity/loadEquityMatrix";
import { computePlayabilityRanking } from "@/lib/equity/handStrength";
import { solvePushFold, type PushFoldResult } from "@/lib/nashSolver/pushFoldSolver";
import { BB_ANTE_BB, BIG_BLIND_BB, SMALL_BLIND_BB } from "./constants";
import { NO_RAKE_SETTINGS, type RakeSettings } from "./rake";
import { CHIP_EV, isChipEv, pushFoldPayoffs, type IcmStructure } from "./icm";

/**
 * Both results depend only on (matrix, stack, opponents behind, ante, rake, ICM, posted blinds), and the matrix is a
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
  /** With ICM, the seats at the table and the stack every one of them, and the field, started with. */
  icm: { structure: IcmStructure; seats: number; stackBb: number } = { structure: CHIP_EV, seats: 0, stackBb: 0 },
  /** The blinds the shover and the caller posted, part of `effectiveStackBb`. Default: the SB shoving on the BB. */
  posted: { shoverBb: number; callerBb: number } = { shoverBb: SMALL_BLIND_BB, callerBb: BIG_BLIND_BB },
): PushFoldResult {
  let bySpot = pushFoldByMatrix.get(matrix);
  if (!bySpot) {
    bySpot = new Map();
    pushFoldByMatrix.set(matrix, bySpot);
  }
  const chipEv = isChipEv(icm.structure);
  const icmKey = chipEv ? "" : `:${icm.structure.id}:${icm.seats}:${icm.stackBb}`;
  const key = `${effectiveStackBb}:${opponentsBehind}:${bbAnte}:${posted.shoverBb}:${posted.callerBb}:${rake.structure.id}:${rake.noFlopNoDrop}${icmKey}`;
  let result = bySpot.get(key);
  if (!result) {
    const potBb = SMALL_BLIND_BB + BIG_BLIND_BB + bbAnte;
    const payoffs = chipEv ? undefined : pushFoldPayoffs(icm.structure, icm.seats, icm.stackBb, effectiveStackBb, potBb, posted);
    result = solvePushFold(matrix, {
      effectiveStackBb,
      opponentsBehind,
      bbAnte,
      shoverPostedBb: posted.shoverBb,
      callerPostedBb: posted.callerBb,
      rake,
      payoffs,
    });
    bySpot.set(key, result);
  }
  return result;
}
