import { describe, expect, it } from "vitest";
import { loadEquityMatrix } from "@/lib/equity/loadEquityMatrix";
import { computePlayabilityRanking } from "@/lib/equity/handStrength";
import { solvePushFold } from "@/lib/nashSolver/pushFoldSolver";
import { getPlayabilityRanking, getPushFoldResult } from "./solveCache";

const matrix = loadEquityMatrix();

describe("getPlayabilityRanking", () => {
  it("returns the same computed ranking on repeat calls", () => {
    const first = getPlayabilityRanking(matrix);
    expect(getPlayabilityRanking(matrix)).toBe(first);
    expect(first).toEqual(computePlayabilityRanking(matrix));
  });
});

describe("getPushFoldResult", () => {
  it("caches per stack depth and matches a direct solve", () => {
    const at10 = getPushFoldResult(matrix, 10);
    expect(getPushFoldResult(matrix, 10)).toBe(at10);
    expect(at10).toEqual(solvePushFold(matrix, { effectiveStackBb: 10 }));

    const at20 = getPushFoldResult(matrix, 20);
    expect(at20).not.toBe(at10);
    expect(at20.shoveFrequency.get("72o")).toBeLessThanOrEqual(at10.shoveFrequency.get("72o")!);
  });

  it("caches each number of opponents behind apart", () => {
    const headsUp = getPushFoldResult(matrix, 10);
    const fullTable = getPushFoldResult(matrix, 10, 7);
    expect(fullTable).not.toBe(headsUp);
    expect(getPushFoldResult(matrix, 10, 7)).toBe(fullTable);
    expect(fullTable).toEqual(solvePushFold(matrix, { effectiveStackBb: 10, opponentsBehind: 7 }));
  });
});
