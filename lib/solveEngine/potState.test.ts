import { describe, expect, it } from "vitest";
import { initialPotState, applyAction } from "./potState";

describe("initialPotState", () => {
  it("seeds the pot with SB + BB + BB ante", () => {
    const state = initialPotState();
    expect(state.committed.SB).toBe(0.5);
    expect(state.committed.BB).toBe(1);
    expect(state.potBb).toBe(2.5); // 0.5 + 1 + 1 (ante)
    expect(state.currentBetToCall).toBe(1);
    expect(state.lastAggressor).toBeNull();
    expect(state.raiseDepth).toBe(0);
  });
});

describe("applyAction", () => {
  it("fold: marks the seat folded without touching the pot", () => {
    const state = initialPotState();
    const next = applyAction(state, "UTG", "fold", { effectiveStackBb: 100 });
    expect(next.foldedSeats.has("UTG")).toBe(true);
    expect(next.potBb).toBe(state.potBb);
    expect(next.lastActor).toBe("UTG");
  });

  it("call: matches currentBetToCall and adds the difference to the pot", () => {
    let state = initialPotState();
    state = applyAction(state, "UTG", "raise", { effectiveStackBb: 100, raiseToBb: 4 });
    const next = applyAction(state, "UTG1", "call", { effectiveStackBb: 100 });
    expect(next.committed.UTG1).toBe(4);
    expect(next.potBb).toBeCloseTo(state.potBb + 4, 6);
  });

  it("raise: uses the supplied raiseToBb and updates aggressor/currentBetToCall/raiseDepth", () => {
    const state = initialPotState();
    const next = applyAction(state, "UTG", "raise", { effectiveStackBb: 100, raiseToBb: 4 });
    expect(next.committed.UTG).toBe(4);
    expect(next.currentBetToCall).toBe(4);
    expect(next.lastAggressor).toBe("UTG");
    expect(next.lastAggressorRaiseToBb).toBe(4);
    expect(next.raiseDepth).toBe(1);
    expect(next.potBb).toBeCloseTo(2.5 + 4, 6);
  });

  it("raise: throws if raiseToBb is not supplied", () => {
    const state = initialPotState();
    expect(() => applyAction(state, "UTG", "raise", { effectiveStackBb: 100 })).toThrow();
  });

  it("allin: treated as a genuine raise when it exceeds currentBetToCall", () => {
    const state = initialPotState();
    const next = applyAction(state, "UTG", "allin", { effectiveStackBb: 20 });
    expect(next.committed.UTG).toBe(20);
    expect(next.currentBetToCall).toBe(20);
    expect(next.lastAggressor).toBe("UTG");
    expect(next.raiseDepth).toBe(1);
  });

  it("committed amounts for a seat that already acted are correctly overwritten, not summed", () => {
    let state = initialPotState();
    state = applyAction(state, "UTG", "raise", { effectiveStackBb: 100, raiseToBb: 4 });
    state = applyAction(state, "UTG1", "raise", { effectiveStackBb: 100, raiseToBb: 12 });
    // UTG reopened, facing UTG1's 3-bet.
    const next = applyAction(state, "UTG", "call", { effectiveStackBb: 100 });
    expect(next.committed.UTG).toBe(12);
    expect(next.potBb).toBeCloseTo(2.5 + 4 + 12 + (12 - 4), 6);
  });

  it("remembers each seat's latest decision and the state it faced", () => {
    const start = initialPotState();
    const opened = applyAction(start, "UTG", "raise", { effectiveStackBb: 100, raiseToBb: 2.8 });
    const threeBet = applyAction(opened, "UTG1", "raise", { effectiveStackBb: 100, raiseToBb: 8.4 });
    expect(threeBet.lastDecision.UTG).toEqual({ state: start, action: "raise" });
    expect(threeBet.lastDecision.UTG1).toEqual({ state: opened, action: "raise" });

    const called = applyAction(threeBet, "UTG", "call", { effectiveStackBb: 100 });
    expect(called.lastDecision.UTG).toEqual({ state: threeBet, action: "call" });
  });
});
