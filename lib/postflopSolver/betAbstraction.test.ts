import { describe, expect, it } from "vitest";
import { initialPostflopPotState, applyPostflopAction } from "./potState";
import { computePostflopAvailableActions } from "./betAbstraction";

describe("computePostflopAvailableActions — opening decision (no bet yet)", () => {
  it("offers check, a 66% pot bet, and allin, but no fold/call", () => {
    const state = initialPostflopPotState(7.5);
    const actions = computePostflopAvailableActions(state, "P1", 97);
    expect(actions.fold).toBe(false);
    expect(actions.check).toBe(true);
    expect(actions.call).toBeNull();
    expect(actions.bet).toEqual({ toBb: 7.5 * 0.66 });
    expect(actions.allin).toEqual({ toBb: 97 });
  });

  it("collapses bet into allin-only when 66% pot would reach the full stack", () => {
    const state = initialPostflopPotState(7.5);
    const actions = computePostflopAvailableActions(state, "P1", 3); // tiny stack
    expect(actions.bet).toBeNull();
    expect(actions.allin).toEqual({ toBb: 3 });
  });
});

describe("computePostflopAvailableActions — facing a bet", () => {
  it("offers fold and call, never a separate raise/allin", () => {
    let state = initialPostflopPotState(7.5);
    state = applyPostflopAction(state, "P1", "bet", { effectiveStackBb: 97, betToBb: 5 });
    const actions = computePostflopAvailableActions(state, "P2", 97);
    expect(actions.fold).toBe(true);
    expect(actions.check).toBe(false);
    expect(actions.call).toEqual({ amountBb: 5 });
    expect(actions.bet).toBeNull();
    expect(actions.allin).toBeNull();
  });

  it("caps the call amount at the caller's own remaining stack (call-all-in when short)", () => {
    let state = initialPostflopPotState(7.5);
    state = applyPostflopAction(state, "P1", "bet", { effectiveStackBb: 97, betToBb: 90 });
    const actions = computePostflopAvailableActions(state, "P2", 10);
    expect(actions.call).toEqual({ amountBb: 10 });
  });
});
