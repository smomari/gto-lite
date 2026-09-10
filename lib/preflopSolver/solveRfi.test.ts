import { describe, expect, it } from "vitest";
import { loadEquityMatrix } from "@/lib/equity/loadEquityMatrix";
import { solveRfi } from "./solveRfi";

describe("solveRfi", () => {
  const matrix = loadEquityMatrix();

  // Only SB is exercised here (and shipped by scripts/generate-preflop-rfi.ts)
  // — see solveRfi.ts's doc comment for why every other opening seat's
  // "opener vs BB" 2-player reduction produces unrealistically wide ranges.

  it(
    "SB at 100bb: AA raises almost always, weak hands are not forced to raise, every hand's fold+raise sums to 1",
    () => {
      const result = solveRfi("SB", matrix, 100, { maxIterations: 20000, targetExploitabilityPercent: 1 });
      expect(result.hands).toHaveLength(169);
      for (const h of result.hands) {
        expect(h.call).toBe(0);
        expect(h.fold + h.raise).toBeCloseTo(1, 6);
        expect(h.raise).toBeGreaterThanOrEqual(0);
        expect(h.raise).toBeLessThanOrEqual(1);
      }
      const aa = result.hands.find((h) => h.hand === "AA")!;
      expect(aa.raise).toBeGreaterThan(0.9);
      // A genuine heads-up SB range is wide but not literally every hand —
      // this is the regression guard against the "169/169 open" degenerate
      // outcome both rejected approaches produced.
      const openCombos = result.hands.reduce((s, h) => {
        const combos = h.hand.length === 2 ? 6 : h.hand.endsWith("s") ? 4 : 12;
        return s + combos * h.raise;
      }, 0);
      expect(openCombos / 1326).toBeLessThan(0.95);
      expect(Number.isFinite(result.exploitability.percentOfPot)).toBe(true);
    },
    20000,
  );
});
