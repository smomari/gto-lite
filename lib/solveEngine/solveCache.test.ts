import { describe, expect, it } from "vitest";
import { loadEquityMatrix } from "@/lib/equity/loadEquityMatrix";
import { computePercentileRanking } from "@/lib/equity/handStrength";
import { solvePushFold } from "@/lib/nashSolver/pushFoldSolver";
import { getPercentileRanking, getPushFoldResult } from "./solveCache";

const matrix = loadEquityMatrix();

describe("getPercentileRanking", () => {
  it("returns the same computed ranking on repeat calls", () => {
    const first = getPercentileRanking(matrix);
    expect(getPercentileRanking(matrix)).toBe(first);
    expect(first).toEqual(computePercentileRanking(matrix));
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
});
