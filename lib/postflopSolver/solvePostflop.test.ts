import { describe, expect, it } from "vitest";
import { ALL_HANDS } from "@/lib/handRange/handList";
import type { HandFrequency } from "@/types/rangeData";
import { solvePostflopStreet } from "./solvePostflop";
import type { DecisionNode } from "./treeBuilder";

/** A narrow, small HandFrequency[] so the resulting ComboRange stays tiny and the test stays fast. */
function narrowHands(includedHands: string[]): HandFrequency[] {
  const included = new Set(includedHands);
  return ALL_HANDS.map((h) => ({
    hand: h.hand,
    fold: included.has(h.hand) ? 0 : 1,
    call: included.has(h.hand) ? 1 : 0,
    raise: 0,
  }));
}

describe("solvePostflopStreet", () => {
  it("runs end-to-end from preflop-shaped HandFrequency[] to a solved tree", () => {
    const board = ["Kh", "7s", "2d"];
    const result = solvePostflopStreet({
      board,
      heroHandFrequencies: narrowHands(["KK", "AA"]), // 12 combos before board removal
      heroActionWeight: (hf) => hf.call,
      villainHandFrequencies: narrowHands(["77", "98s"]), // 10 combos before board removal
      villainActionWeight: (hf) => hf.call,
      startPot: 7.5,
      effectiveStackBb: 10,
      iterations: 200,
    });

    expect(result.heroRange.length).toBeGreaterThan(0);
    expect(result.villainRange.length).toBeGreaterThan(0);
    // A specific suit appears in 3 of a pair's 6 combos (paired with each of
    // the other 3 suits) — KK loses 3 combos to the board's Kh, 77 loses 3 to 7s.
    expect(result.heroRange.length).toBe(3 + 6); // KK(3 left) + AA(6, unblocked)
    expect(result.villainRange.length).toBe(3 + 4); // 77(3 left) + 98s(4, unblocked)

    const root = result.tree as DecisionNode;
    const strategy = result.solution.getAverageStrategy(root);
    expect(strategy).toHaveLength(result.heroRange.length);
    for (const row of strategy) {
      expect(row.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 6);
    }
  });

  it("throws if a range is empty after board removal", () => {
    const board = ["Kh", "7s", "2d"];
    expect(() =>
      solvePostflopStreet({
        board,
        heroHandFrequencies: narrowHands([]), // nobody weighted -> empty range
        heroActionWeight: (hf) => hf.call,
        villainHandFrequencies: narrowHands(["77"]),
        villainActionWeight: (hf) => hf.call,
        startPot: 7.5,
        effectiveStackBb: 10,
        iterations: 50,
      }),
    ).toThrow();
  });
});
