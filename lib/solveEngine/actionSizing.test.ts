import { describe, expect, it } from "vitest";
import { initialPotState, applyAction } from "./potState";
import { computeAvailableActions, computeRawRaiseTo } from "./actionSizing";

describe("computeRawRaiseTo — opening raises", () => {
  const opens = (stack: number) =>
    (["UTG", "UTG1", "LJ", "HJ", "CO", "BTN", "SB"] as const).map((seat) => computeRawRaiseTo(seat, initialPotState(), stack));

  it("opens 2bb from every seat and 3bb from the SB at and below the scaling threshold", () => {
    expect(opens(40)).toEqual([2, 2, 2, 2, 2, 2, 3]);
    expect(opens(20)).toEqual([2, 2, 2, 2, 2, 2, 3]);
  });

  it("opens by seat at the max supported stack (100bb)", () => {
    expect(opens(100)).toEqual([2.1, 2.1, 2.1, 2.1, 2.2, 2.5, 3.5]);
  });

  it("interpolates linearly between the shallow and deep sizes", () => {
    expect(computeRawRaiseTo("BTN", initialPotState(), 64)).toBe(2.2); // 40% of the way from 40bb to 100bb
    expect(computeRawRaiseTo("SB", initialPotState(), 64)).toBe(3.2);
  });

  it("clamps to the deep-stack value beyond the max supported stack (defensive — unreachable via the validated API)", () => {
    expect(opens(150)).toEqual(opens(100));
  });
});

describe("computeRawRaiseTo — reactive raises", () => {
  it("raises 3x (IP) when the raiser acts after the last aggressor postflop", () => {
    const state = applyAction(initialPotState(), "UTG", "raise", { effectiveStackBb: 100, raiseToBb: 4 });
    expect(computeRawRaiseTo("CO", state, 100)).toBe(12); // 4 * 3
  });

  it("raises 4x (OOP) when the raiser acts before the last aggressor postflop", () => {
    const state = applyAction(initialPotState(), "CO", "raise", { effectiveStackBb: 100, raiseToBb: 3 });
    // A constructed fixture: CO opened after UTG's turn had already passed.
    expect(computeRawRaiseTo("UTG", state, 100)).toBe(12); // 3 * 4
  });

  it("treats the blinds as OOP even though they act last preflop: SB and BB reacting to BTN raise 4x", () => {
    const state = applyAction(initialPotState(), "BTN", "raise", { effectiveStackBb: 100, raiseToBb: 2.5 });
    expect(computeRawRaiseTo("SB", state, 100)).toBe(10); // 2.5 * 4
    expect(computeRawRaiseTo("BB", state, 100)).toBe(10);
  });

  it("gives BTN position over a blind's 3-bet: 3x, though BTN acts before the blinds preflop", () => {
    const open = applyAction(initialPotState(), "BTN", "raise", { effectiveStackBb: 100, raiseToBb: 2.5 });
    const threeBet = applyAction(open, "SB", "raise", { effectiveStackBb: 100, raiseToBb: 10 });
    expect(computeRawRaiseTo("BTN", threeBet, 100)).toBe(30); // 10 * 3
  });

  it("puts SB out of position against BB", () => {
    const state = applyAction(initialPotState(), "BB", "raise", { effectiveStackBb: 100, raiseToBb: 3 });
    expect(computeRawRaiseTo("SB", state, 100)).toBe(12); // 3 * 4
  });

  it("always compares against the CURRENT lastAggressor, not a stale one, when a seat reopens", () => {
    let state = applyAction(initialPotState(), "UTG", "raise", { effectiveStackBb: 100, raiseToBb: 4 });
    state = applyAction(state, "LJ", "raise", { effectiveStackBb: 100, raiseToBb: 12 });
    // UTG reopens, facing LJ's 3-bet now, not its own earlier open.
    expect(computeRawRaiseTo("UTG", state, 100)).toBe(48); // 12 * 4 (UTG index 0 < LJ index 2 -> OOP)
  });
});

describe("computeAvailableActions", () => {
  const limped = () => applyAction(initialPotState(), "SB", "call", { effectiveStackBb: 40 });

  it("offers SB a half-bb limp in an unraised pot, but no other seat, and not at push/fold stacks", () => {
    expect(computeAvailableActions("SB", initialPotState(), 16).call).toEqual({ label: "Limp", amountBb: 0.5 });
    expect(computeAvailableActions("SB", initialPotState(), 15).call).toBeNull();
    expect(computeAvailableActions("BTN", initialPotState(), 40).call).toBeNull();
  });

  it("gives BB a free check and a 3.5bb raise behind a limp, and no fold", () => {
    expect(computeAvailableActions("BB", limped(), 40)).toEqual({
      fold: false,
      call: { label: "Check", amountBb: 0 },
      raise: { toBb: 3.5 },
      allin: { toBb: 40 },
    });
  });

  it("offers Fold/Raise/Allin but no Call for the opening decision", () => {
    const actions = computeAvailableActions("UTG", initialPotState(), 100);
    expect(actions.fold).toBe(true);
    expect(actions.call).toBeNull();
    expect(actions.raise).toEqual({ toBb: 2.1 });
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

  it("offers no Allin facing an all-in, where Call already puts the whole stack in", () => {
    const state = applyAction(initialPotState(), "UTG", "allin", { effectiveStackBb: 20 });
    const actions = computeAvailableActions("BB", state, 20);
    expect(actions.allin).toBeNull();
    expect(actions.raise).toBeNull();
    expect(actions.call).toEqual({ label: "Call", amountBb: 19 });
  });

  it("only offers all-in at the push/fold stacks, whose charts have no smaller raise", () => {
    expect(computeAvailableActions("UTG", initialPotState(), 15)).toMatchObject({ raise: null, allin: { toBb: 15 } });
    expect(computeAvailableActions("UTG", initialPotState(), 16).raise).not.toBeNull();
  });
});
