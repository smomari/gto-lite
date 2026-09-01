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
      kind: "canonical",
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
        kind: "canonical",
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

  it("kind: combos — solves from an already-computed combo range, re-filtering for a newly-dealt card", () => {
    const board = ["Kh", "7s", "2d", "9c"]; // turn board: 3 flop cards + 1 new turn card
    const result = solvePostflopStreet({
      kind: "combos",
      board,
      heroRange: [
        { cards: ["Ks", "Kd"], weight: 1 },
        { cards: ["9s", "9h"], weight: 1 }, // blocked by the turn's 9c? no — different suits, stays
        { cards: ["9c", "8d"], weight: 1 }, // blocked by the turn card itself
      ],
      villainRange: [
        { cards: ["7h", "6c"], weight: 1 },
        { cards: ["Ah", "Ad"], weight: 1 },
      ],
      startPot: 12.4,
      effectiveStackBb: 20,
      iterations: 100,
    });

    expect(result.heroRange).toEqual([
      { cards: ["Ks", "Kd"], weight: 1 },
      { cards: ["9s", "9h"], weight: 1 },
    ]);
    expect(result.villainRange).toHaveLength(2);
  });
});
