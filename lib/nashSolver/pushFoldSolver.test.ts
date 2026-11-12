import { describe, expect, it } from "vitest";
import { ALL_HANDS } from "@/lib/handRange/handList";
import type { EquityMatrix } from "@/lib/equity/loadEquityMatrix";
import { loadEquityMatrix } from "@/lib/equity/loadEquityMatrix";
import { solvePushFold } from "./pushFoldSolver";
import type { RakeSettings } from "@/lib/solveEngine/rake";

/**
 * A fully synthetic, self-consistent equity matrix where hand at array index i
 * always beats a hand at a larger index by a fixed margin. Not meant to reflect
 * real poker strength — just a controlled input with a known, analytically
 * clean structure to check the solver recovers a threshold equilibrium.
 */
function buildSyntheticMatrix(): EquityMatrix {
  const n = ALL_HANDS.length;
  const rankOf = new Map(ALL_HANDS.map((h, i) => [h.hand, i]));
  const matrix: EquityMatrix = {};
  for (const a of ALL_HANDS) {
    matrix[a.hand] = {};
    for (const b of ALL_HANDS) {
      const diff = rankOf.get(b.hand)! - rankOf.get(a.hand)!;
      matrix[a.hand][b.hand] = 0.5 + diff / (2 * (n - 1));
    }
  }
  return matrix;
}

// Damped convergence asymptotically approaches 0/1 for non-boundary hands but
// rarely lands on the exact float, so comparisons use a tight tolerance band
// rather than strict equality.
const CLEARLY_SHOVES = 0.99;
const CLEARLY_FOLDS = 0.01;

describe("solvePushFold (synthetic matrix)", () => {
  const synthetic = buildSyntheticMatrix();

  it("shoves the best hand and folds the worst hand", () => {
    const result = solvePushFold(synthetic, { effectiveStackBb: 15 });
    expect(result.shoveFrequency.get(ALL_HANDS[0].hand)!).toBeGreaterThan(CLEARLY_SHOVES);
    expect(result.shoveFrequency.get(ALL_HANDS[ALL_HANDS.length - 1].hand)!).toBeLessThan(
      CLEARLY_FOLDS,
    );
  });

  it("produces a clean threshold with no fold-then-shove gaps", () => {
    const result = solvePushFold(synthetic, { effectiveStackBb: 15 });
    const freqs = ALL_HANDS.map((h) => result.shoveFrequency.get(h.hand) ?? 0);
    let sawClearFold = false;
    let gapFound = false;
    for (const f of freqs) {
      if (f < CLEARLY_FOLDS) sawClearFold = true;
      else if (f > CLEARLY_SHOVES && sawClearFold) gapFound = true;
    }
    expect(gapFound).toBe(false);
  });

  it("shoves a wider range at a smaller effective stack", () => {
    const shallow = solvePushFold(synthetic, { effectiveStackBb: 8 });
    const deep = solvePushFold(synthetic, { effectiveStackBb: 40 });
    const weightedShoveCombos = (freq: Map<string, number>) =>
      ALL_HANDS.reduce((sum, h) => sum + h.combos * (freq.get(h.hand) ?? 0), 0);
    expect(weightedShoveCombos(shallow.shoveFrequency)).toBeGreaterThan(
      weightedShoveCombos(deep.shoveFrequency),
    );
  });

  it("shoves a wider range with the BB ante in than without it (more dead money to win)", () => {
    const withAnte = solvePushFold(synthetic, { effectiveStackBb: 15, bbAnte: 1 });
    const withoutAnte = solvePushFold(synthetic, { effectiveStackBb: 15, bbAnte: 0 });
    const weightedShoveCombos = (freq: Map<string, number>) =>
      ALL_HANDS.reduce((sum, h) => sum + h.combos * (freq.get(h.hand) ?? 0), 0);
    expect(weightedShoveCombos(withAnte.shoveFrequency)).toBeGreaterThan(
      weightedShoveCombos(withoutAnte.shoveFrequency),
    );
  });

});

describe("solvePushFold (real 20bb equity matrix — directional regression)", () => {
  const matrix = loadEquityMatrix();
  /** Percent of all combos. */
  const shareOf = (freq: Map<string, number>) => (100 * ALL_HANDS.reduce((sum, h) => sum + h.combos * (freq.get(h.hand) ?? 0), 0)) / 1326;
  const result = solvePushFold(matrix, { effectiveStackBb: 20 });

  it("always shoves AA", () => {
    expect(result.shoveFrequency.get("AA")!).toBeGreaterThan(CLEARLY_SHOVES);
  });

  it("always folds 72o", () => {
    expect(result.shoveFrequency.get("72o")!).toBeLessThan(CLEARLY_FOLDS);
  });

  it("shoves a plausible fraction of combos, not everything or nothing", () => {
    const shovedCombos = ALL_HANDS.reduce(
      (sum, h) => sum + h.combos * (result.shoveFrequency.get(h.hand) ?? 0),
      0,
    );
    expect(shovedCombos).toBeGreaterThan(1326 * 0.05);
    expect(shovedCombos).toBeLessThan(1326 * 0.7);
  });

  it("treats one opponent behind as the heads-up default", () => {
    expect(solvePushFold(matrix, { effectiveStackBb: 20, opponentsBehind: 1 })).toEqual(result);
  });

  it("shoves a narrower range with more opponents left to act", () => {
    const shovedCombos = (opponentsBehind: number) => {
      const { shoveFrequency } = solvePushFold(matrix, { effectiveStackBb: 20, opponentsBehind });
      return ALL_HANDS.reduce((sum, h) => sum + h.combos * (shoveFrequency.get(h.hand) ?? 0), 0);
    };
    expect(shovedCombos(2)).toBeLessThan(shovedCombos(1));
    expect(shovedCombos(7)).toBeLessThan(shovedCombos(2));
  });

  it("stops at its iteration cap on a spot that cycles instead of converging", () => {
    const cycling = solvePushFold(matrix, { effectiveStackBb: 21, opponentsBehind: 7, shoverPostedBb: 0 });
    expect(cycling.converged).toBe(false);
    expect(cycling.iterations).toBe(300);
    expect(cycling.shoveFrequency.get("AA")!).toBeGreaterThan(CLEARLY_SHOVES);
  });

  it("keeps every hand's frequency within [0, 1]", () => {
    for (const h of ALL_HANDS) {
      const freq = result.shoveFrequency.get(h.hand) ?? 0;
      expect(freq).toBeGreaterThanOrEqual(0);
      expect(freq).toBeLessThanOrEqual(1);
    }
  });

  it("matches published heads-up Nash at 10bb without an ante: the SB shoves 57.5%, the BB calls 36.4%", () => {
    const { shoveFrequency, callFrequency } = solvePushFold(matrix, { effectiveStackBb: 10, bbAnte: 0 });
    expect(shareOf(shoveFrequency)).toBeCloseTo(57.5, 0);
    expect(shareOf(callFrequency)).toBeCloseTo(36.4, 0);
  });

  it("counts the blinds each posted as part of its stack, so the SB doesn't win its own blind back from a call", () => {
    // Pricing the called pot as both stacks plus every blind shoved 77% here.
    expect(shareOf(solvePushFold(matrix, { effectiveStackBb: 10, bbAnte: 1 }).shoveFrequency)).toBeCloseTo(71.8, 0);
  });

  it("calls tighter when the pot pays rake, and rake on the blinds only matters without no flop no drop", () => {
    const callWidth = (rake?: RakeSettings) => [...solvePushFold(matrix, { effectiveStackBb: 10, bbAnte: 0, rake }).callFrequency.values()].reduce((a, b) => a + b, 0);
    const structure = { id: "live", label: "Live", rate: 0.1, capBb: 3, stakes: "" } as const;
    expect(callWidth({ structure, noFlopNoDrop: true })).toBeLessThan(callWidth());
    expect(solvePushFold(matrix, { effectiveStackBb: 10, bbAnte: 0, rake: { structure, noFlopNoDrop: false } }).shoveFrequency).not.toEqual(
      solvePushFold(matrix, { effectiveStackBb: 10, bbAnte: 0, rake: { structure, noFlopNoDrop: true } }).shoveFrequency,
    );
  });
});
