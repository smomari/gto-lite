import { describe, expect, it } from "vitest";
import { initialPotState, applyAction } from "./potState";
import { computeAvailableActions, computeRawRaiseTo } from "./actionSizing";

describe("computeRawRaiseTo — opening raises", () => {
  it("opens 4bb (OOP) from UTG, UTG1, LJ, HJ", () => {
    const state = initialPotState();
    for (const seat of ["UTG", "UTG1", "LJ", "HJ"] as const) {
      expect(computeRawRaiseTo(seat, state)).toBe(4);
    }
  });

  it("opens 3bb (IP) from CO, BTN, SB", () => {
    const state = initialPotState();
    for (const seat of ["CO", "BTN", "SB"] as const) {
      expect(computeRawRaiseTo(seat, state)).toBe(3);
    }
  });
});

describe("computeRawRaiseTo — reactive raises", () => {
  it("raises 3x (IP) when the raiser's seat index is after the last aggressor's", () => {
    const state = applyAction(initialPotState(), "UTG", "raise", { effectiveStackBb: 100, raiseToBb: 4 });
    expect(computeRawRaiseTo("CO", state)).toBe(12); // 4 * 3
  });

  it("raises 4x (OOP) when the raiser's seat index is before the last aggressor's", () => {
    const state = applyAction(initialPotState(), "CO", "raise", { effectiveStackBb: 100, raiseToBb: 3 });
    // UTG is seat index 0, CO is 4 — UTG is "before" CO, so OOP by the literal seat-order rule,
    // even though CO opened after UTG's turn already passed in this constructed fixture.
    expect(computeRawRaiseTo("UTG", state)).toBe(12); // 3 * 4
  });

  it("uses the literal seat-order rule even when it contradicts real postflop position: SB reacting to BTN is classified IP", () => {
    const state = applyAction(initialPotState(), "BTN", "raise", { effectiveStackBb: 100, raiseToBb: 3 });
    // SB (index 6) is after BTN (index 5), so this rule calls it IP (3x), even
    // though SB is always out of position postflop against BTN in real poker.
    expect(computeRawRaiseTo("SB", state)).toBe(9); // 3 * 3
  });

  it("always compares against the CURRENT lastAggressor, not a stale one, when a seat reopens", () => {
    let state = applyAction(initialPotState(), "UTG", "raise", { effectiveStackBb: 100, raiseToBb: 4 });
    state = applyAction(state, "LJ", "raise", { effectiveStackBb: 100, raiseToBb: 12 });
    // UTG reopens, facing LJ's 3-bet now, not its own earlier open.
    expect(computeRawRaiseTo("UTG", state)).toBe(48); // 12 * 4 (UTG index 0 < LJ index 2 -> OOP)
  });
});

describe("computeAvailableActions", () => {
  it("offers Fold/Raise/Allin but no Call for the opening decision", () => {
    const actions = computeAvailableActions("UTG", initialPotState(), 100);
    expect(actions.fold).toBe(true);
    expect(actions.call).toBeNull();
    expect(actions.raise).toEqual({ toBb: 4 });
    expect(actions.allin).toEqual({ toBb: 100 });
  });

  it("offers Call once there's a prior aggressor", () => {
    const state = applyAction(initialPotState(), "UTG", "raise", { effectiveStackBb: 100, raiseToBb: 4 });
    const actions = computeAvailableActions("UTG1", state, 100);
    expect(actions.call).toEqual({ label: "Call", amountBb: 4 });
  });

  it("collapses Raise into Allin when the computed size reaches the effective stack", () => {
    const state = applyAction(initialPotState(), "UTG", "raise", { effectiveStackBb: 20, raiseToBb: 4 });
    // UTG1 reacting: 4 * 3 = 12, well under a 20bb stack — raise should show.
    const wide = computeAvailableActions("UTG1", state, 20);
    expect(wide.raise).toEqual({ toBb: 12 });

    // Now with a 10bb stack, 12 gets capped to 10 (=stack) — raise should collapse to allin-only.
    const short = computeAvailableActions("UTG1", state, 10);
    expect(short.raise).toBeNull();
    expect(short.allin).toEqual({ toBb: 10 });
  });

  it('labels the call option "Check" when nothing is owed (constructed fixture — not reachable via real replay)', () => {
    const state = applyAction(initialPotState(), "UTG", "raise", { effectiveStackBb: 100, raiseToBb: 4 });
    const alreadyMatched = { ...state, committed: { ...state.committed, UTG1: 4 } };
    const actions = computeAvailableActions("UTG1", alreadyMatched, 100);
    expect(actions.call).toEqual({ label: "Check", amountBb: 0 });
  });
});
