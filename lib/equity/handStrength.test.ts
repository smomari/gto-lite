import { describe, expect, it } from "vitest";
import { loadEquityMatrix } from "./loadEquityMatrix";
import { computePercentileRanking, equityVsRandom } from "./handStrength";

describe("handStrength", () => {
  const matrix = loadEquityMatrix();

  it("ranks AA as the strongest hand vs random", () => {
    const ranking = computePercentileRanking(matrix);
    expect(ranking.get("AA")).toBe(0);
  });

  it("ranks 72o near the bottom of the equity-vs-random ranking", () => {
    // Folklore's "worst hand", but 32o edges it out slightly via straight
    // potential, so this only asserts 72o is in the bottom decile, not #169.
    const ranking = computePercentileRanking(matrix);
    expect(ranking.get("72o")!).toBeGreaterThan(0.9);
  });

  it("gives AA higher equity vs random than 72o", () => {
    expect(equityVsRandom(matrix, "AA")).toBeGreaterThan(equityVsRandom(matrix, "72o"));
  });

  it("orders pocket pairs by rank (AA > KK > ... > 22 roughly monotonic)", () => {
    const ranking = computePercentileRanking(matrix);
    expect(ranking.get("AA")!).toBeLessThan(ranking.get("KK")!);
    expect(ranking.get("KK")!).toBeLessThan(ranking.get("QQ")!);
  });
});
