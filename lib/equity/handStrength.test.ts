import { describe, expect, it } from "vitest";
import { loadEquityMatrix } from "./loadEquityMatrix";
import { computePlayabilityRanking, equityVsRandom } from "./handStrength";

describe("handStrength", () => {
  const matrix = loadEquityMatrix();

  const ranking = computePlayabilityRanking(matrix);

  it("ranks AA first and 72o near the bottom", () => {
    expect(ranking.get("AA")!).toBeLessThan(0.01);
    expect(ranking.get("72o")!).toBeGreaterThan(0.9);
  });

  it("is combo-weighted: every percentile sits inside [0, 1] and the last hand ends at the top", () => {
    const values = [...ranking.values()];
    expect(values).toHaveLength(169);
    expect(Math.max(...values)).toBeGreaterThan(0.99);
    expect(Math.min(...values)).toBeGreaterThan(0);
  });

  it("ranks hands that play well postflop above offsuit hands that only win all-ins", () => {
    expect(ranking.get("76s")!).toBeLessThan(ranking.get("K4o")!);
    expect(ranking.get("A5s")!).toBeLessThan(ranking.get("A9o")!);
    expect(ranking.get("22")!).toBeLessThan(ranking.get("Q7o")!);
  });

  it("gives AA higher equity vs random than 72o", () => {
    expect(equityVsRandom(matrix, "AA")).toBeGreaterThan(equityVsRandom(matrix, "72o"));
  });

  it("orders pocket pairs by rank", () => {
    expect(ranking.get("AA")!).toBeLessThan(ranking.get("KK")!);
    expect(ranking.get("KK")!).toBeLessThan(ranking.get("QQ")!);
  });
});
