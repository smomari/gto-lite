import { describe, expect, it } from "vitest";
import { loadEquityMatrix, equityOf } from "./loadEquityMatrix";

describe("loadEquityMatrix", () => {
  const matrix = loadEquityMatrix();

  it("is symmetric: equityOf(A,B) + equityOf(B,A) ≈ 1", () => {
    const pairs: [string, string][] = [
      ["AA", "72o"],
      ["AKs", "QQ"],
      ["22", "AKo"],
      ["JTs", "99"],
    ];
    for (const [a, b] of pairs) {
      expect(equityOf(matrix, a, b) + equityOf(matrix, b, a)).toBeCloseTo(1, 5);
    }
  });

  it("gives AA a large edge over 72o", () => {
    expect(equityOf(matrix, "AA", "72o")).toBeGreaterThan(0.8);
  });

  it("gives near coin-flip equity for classic race spots", () => {
    const eq = equityOf(matrix, "22", "AKo");
    expect(eq).toBeGreaterThan(0.4);
    expect(eq).toBeLessThan(0.6);
  });

  it("has an entry for all 169x169 hand pairs", () => {
    const hands = Object.keys(matrix);
    expect(hands).toHaveLength(169);
    for (const h of hands) {
      expect(Object.keys(matrix[h])).toHaveLength(169);
    }
  });
});
