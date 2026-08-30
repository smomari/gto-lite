import { describe, expect, it } from "vitest";
import { loadEquityMatrix } from "@/lib/equity/loadEquityMatrix";
import { initialPotState, applyAction } from "./potState";
import { solveActiveSeat } from "./solve";

const matrix = loadEquityMatrix();

describe("solveActiveSeat", () => {
  it("routes a shallow-stack opening spot to Nash and produces allin-only frequencies", () => {
    const result = solveActiveSeat(matrix, "UTG", initialPotState(), 20);
    expect(result.source).toBe("nash-shove-fold");
    for (const h of result.hands) {
      expect(h.call).toBe(0);
      expect(h.raise).toBe(0);
      expect(h.fold + (h.allin ?? 0)).toBeCloseTo(1, 6);
    }
    const aa = result.hands.find((h) => h.hand === "AA")!;
    expect(aa.allin).toBeGreaterThan(0.9);
  });

  it("routes a deep-stack opening spot to the heuristic engine and produces raise-only frequencies", () => {
    const result = solveActiveSeat(matrix, "BTN", initialPotState(), 100);
    expect(result.source).toBe("heuristic-approx");
    for (const h of result.hands) {
      expect(h.call).toBe(0);
      expect(h.allin ?? 0).toBe(0);
      expect(h.fold + h.raise).toBeCloseTo(1, 6);
    }
  });

  it("produces call+raise summing correctly with fold for a deep-stack facing-raise spot", () => {
    const state = applyAction(initialPotState(), "UTG", "raise", { effectiveStackBb: 100, raiseToBb: 4 });
    const result = solveActiveSeat(matrix, "CO", state, 100);
    expect(result.source).toBe("heuristic-approx");
    for (const h of result.hands) {
      expect(h.fold + h.call + h.raise).toBeCloseTo(1, 6);
    }
  });

  it("routes to Nash for a facing-raise spot with a low remaining stack-to-pot ratio, even at a stack above the flat threshold", () => {
    let state = applyAction(initialPotState(), "UTG", "raise", { effectiveStackBb: 40, raiseToBb: 4 });
    state = applyAction(state, "BB", "raise", { effectiveStackBb: 40, raiseToBb: 12 });
    // UTG shoves the rest of a 40bb stack over BB's 3-bet — BB now faces a big
    // pot relative to its own remaining stack (28bb behind a 53.5bb pot),
    // which should classify as Nash despite the 40bb starting stack being
    // above the flat 25bb threshold.
    state = applyAction(state, "UTG", "allin", { effectiveStackBb: 40 });
    const result = solveActiveSeat(matrix, "BB", state, 40);
    expect(result.source).toBe("nash-shove-fold");
    for (const h of result.hands) {
      expect(h.raise).toBe(0);
      expect(h.fold + h.call).toBeCloseTo(1, 6);
    }
  });
});
