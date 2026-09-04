import { describe, expect, it } from "vitest";
import { initialPostflopPotState, applyPostflopAction } from "./potState";
import { computePostflopAvailableActions } from "./betAbstraction";

describe("computePostflopAvailableActions — opening decision (no bet yet)", () => {
  it("flop offers check, 50%/100% pot bets, and allin, but no fold/call/raise", () => {
    const state = initialPostflopPotState(7.5);
    const actions = computePostflopAvailableActions(state, "P1", 97, "flop");
    expect(actions.fold).toBe(false);
    expect(actions.check).toBe(true);
    expect(actions.call).toBeNull();
    expect(actions.bet).toEqual([{ toBb: 7.5 * 0.5 }, { toBb: 7.5 * 1.0 }]);
    expect(actions.raise).toEqual([]);
    expect(actions.allin).toEqual({ toBb: 97 });
  });

  it("turn/river offer 33%/66%/100% pot bets", () => {
    const state = initialPostflopPotState(10);
    const turnActions = computePostflopAvailableActions(state, "P1", 97, "turn");
    expect(turnActions.bet).toEqual([{ toBb: 10 * 0.33 }, { toBb: 10 * 0.66 }, { toBb: 10 }]);
    const riverActions = computePostflopAvailableActions(state, "P1", 97, "river");
    expect(riverActions.bet).toEqual([{ toBb: 10 * 0.33 }, { toBb: 10 * 0.66 }, { toBb: 10 }]);
  });

  it("drops only the sizes that collapse into allin, keeping the rest", () => {
    // Pot 10, stack 8: 33%=3.3 and 66%=6.6 fit, 100%=10 would exceed the stack.
    const state = initialPostflopPotState(10);
    const actions = computePostflopAvailableActions(state, "P1", 8, "turn");
    expect(actions.bet).toEqual([{ toBb: 10 * 0.33 }, { toBb: 10 * 0.66 }]);
    expect(actions.allin).toEqual({ toBb: 8 });
  });

  it("collapses every bet size into allin-only when the stack is too short for even the smallest", () => {
    const state = initialPostflopPotState(7.5);
    const actions = computePostflopAvailableActions(state, "P1", 2, "flop"); // tiny stack
    expect(actions.bet).toEqual([]);
    expect(actions.allin).toEqual({ toBb: 2 });
  });
});

describe("computePostflopAvailableActions — facing a bet, no raise yet (raiseCount 0)", () => {
  it("offers fold, call, pot-raise sizes, and allin", () => {
    let state = initialPostflopPotState(7.5);
    state = applyPostflopAction(state, "P1", "bet", { effectiveStackBb: 97, betToBb: 5 });
    const actions = computePostflopAvailableActions(state, "P2", 97, "flop");
    expect(actions.fold).toBe(true);
    expect(actions.check).toBe(false);
    expect(actions.call).toEqual({ amountBb: 5 });
    expect(actions.bet).toEqual([]);
    // pot before P1's bet was 7.5, after betting 5 it's 12.5; potAfterCall = 12.5 + 5 = 17.5.
    // flop raise fraction is [1.0]: raiseTo = 5 + 1.0*17.5 = 22.5.
    expect(actions.raise).toEqual([{ toBb: 22.5 }]);
    expect(actions.allin).toEqual({ toBb: 97 });
  });

  it("turn/river offer 2 raise sizes (50% and 100%)", () => {
    let state = initialPostflopPotState(10);
    state = applyPostflopAction(state, "P1", "bet", { effectiveStackBb: 97, betToBb: 10 });
    const actions = computePostflopAvailableActions(state, "P2", 97, "turn");
    // pot before bet 10, after bet 20; potAfterCall = 20 + 10 = 30.
    // raise fractions [0.5, 1.0]: raiseTo = 10 + 0.5*30 = 25, and 10 + 1.0*30 = 40.
    expect(actions.raise).toEqual([{ toBb: 25 }, { toBb: 40 }]);
  });

  it("caps the call amount at the caller's own remaining stack (call-all-in when short)", () => {
    let state = initialPostflopPotState(7.5);
    state = applyPostflopAction(state, "P1", "bet", { effectiveStackBb: 97, betToBb: 90 });
    const actions = computePostflopAvailableActions(state, "P2", 10, "flop");
    expect(actions.call).toEqual({ amountBb: 10 });
  });
});

describe("computePostflopAvailableActions — facing a raise (raiseCount at cap)", () => {
  it("offers only fold/call, never a further raise or allin", () => {
    let state = initialPostflopPotState(7.5);
    state = applyPostflopAction(state, "P1", "bet", { effectiveStackBb: 97, betToBb: 5 });
    state = applyPostflopAction(state, "P2", "raise", { effectiveStackBb: 97, betToBb: 22.5 });
    const actions = computePostflopAvailableActions(state, "P1", 97, "flop");
    expect(actions.fold).toBe(true);
    // P1 already had 5 committed from their own bet; they owe 22.5-5=17.5 to call the raise.
    expect(actions.call).toEqual({ amountBb: 17.5 });
    expect(actions.bet).toEqual([]);
    expect(actions.raise).toEqual([]);
    expect(actions.allin).toBeNull();
  });
});
