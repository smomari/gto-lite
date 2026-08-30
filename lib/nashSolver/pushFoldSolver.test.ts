import { describe, expect, it } from "vitest";
import { ALL_HANDS } from "@/lib/handRange/handList";
import type { EquityMatrix } from "@/lib/equity/loadEquityMatrix";
import { loadEquityMatrix } from "@/lib/equity/loadEquityMatrix";
import { solvePushFold } from "./pushFoldSolver";

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

  it("keeps every hand's frequency within [0, 1]", () => {
    for (const h of ALL_HANDS) {
      const freq = result.shoveFrequency.get(h.hand) ?? 0;
      expect(freq).toBeGreaterThanOrEqual(0);
      expect(freq).toBeLessThanOrEqual(1);
    }
  });
});
