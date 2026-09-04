import { describe, expect, it } from "vitest";
import { initialPostflopPotState, applyPostflopAction, totalPot, otherPlayer } from "./potState";

describe("initialPostflopPotState", () => {
  it("seeds with the dead pot from before the street and no chips committed yet", () => {
    const state = initialPostflopPotState(7.5);
    expect(state.startPot).toBe(7.5);
    expect(state.committed).toEqual({ P1: 0, P2: 0 });
    expect(state.currentBetToCall).toBe(0);
    expect(state.raiseCount).toBe(0);
    expect(totalPot(state)).toBe(7.5);
  });
});

describe("otherPlayer", () => {
  it("flips between P1 and P2", () => {
    expect(otherPlayer("P1")).toBe("P2");
    expect(otherPlayer("P2")).toBe("P1");
  });
});

describe("applyPostflopAction", () => {
  it("check: no chips move", () => {
    const state = initialPostflopPotState(7.5);
    const next = applyPostflopAction(state, "P1", "check", { effectiveStackBb: 97 });
    expect(next.committed).toEqual({ P1: 0, P2: 0 });
    expect(next.lastActor).toBe("P1");
  });

  it("bet: sets committed/currentBetToCall/lastAggressor", () => {
    const state = initialPostflopPotState(7.5);
    const next = applyPostflopAction(state, "P1", "bet", { effectiveStackBb: 97, betToBb: 5 });
    expect(next.committed.P1).toBe(5);
    expect(next.currentBetToCall).toBe(5);
    expect(next.lastAggressor).toBe("P1");
    expect(totalPot(next)).toBe(12.5);
  });

  it("bet: throws without betToBb", () => {
    const state = initialPostflopPotState(7.5);
    expect(() => applyPostflopAction(state, "P1", "bet", { effectiveStackBb: 97 })).toThrow();
  });

  it("bet: does not increment raiseCount (opening a street isn't a raise)", () => {
    const state = initialPostflopPotState(7.5);
    const next = applyPostflopAction(state, "P1", "bet", { effectiveStackBb: 97, betToBb: 5 });
    expect(next.raiseCount).toBe(0);
  });

  it("raise: sets committed/currentBetToCall/lastAggressor and increments raiseCount", () => {
    let state = initialPostflopPotState(7.5);
    state = applyPostflopAction(state, "P1", "bet", { effectiveStackBb: 97, betToBb: 5 });
    const next = applyPostflopAction(state, "P2", "raise", { effectiveStackBb: 97, betToBb: 20 });
    expect(next.committed.P2).toBe(20);
    expect(next.currentBetToCall).toBe(20);
    expect(next.lastAggressor).toBe("P2");
    expect(next.raiseCount).toBe(1);
  });

  it("raise: throws without betToBb", () => {
    let state = initialPostflopPotState(7.5);
    state = applyPostflopAction(state, "P1", "bet", { effectiveStackBb: 97, betToBb: 5 });
    expect(() => applyPostflopAction(state, "P2", "raise", { effectiveStackBb: 97 })).toThrow();
  });

  it("call: matches currentBetToCall", () => {
    let state = initialPostflopPotState(7.5);
    state = applyPostflopAction(state, "P1", "bet", { effectiveStackBb: 97, betToBb: 5 });
    const next = applyPostflopAction(state, "P2", "call", { effectiveStackBb: 97 });
    expect(next.committed.P2).toBe(5);
    expect(totalPot(next)).toBe(17.5);
  });

  it("allin: treated as genuine aggression when it exceeds currentBetToCall", () => {
    const state = initialPostflopPotState(7.5);
    const next = applyPostflopAction(state, "P1", "allin", { effectiveStackBb: 97 });
    expect(next.committed.P1).toBe(97);
    expect(next.currentBetToCall).toBe(97);
    expect(next.lastAggressor).toBe("P1");
  });

  it("allin: treated as a call (not aggression) when it doesn't exceed currentBetToCall", () => {
    let state = initialPostflopPotState(7.5);
    state = applyPostflopAction(state, "P1", "bet", { effectiveStackBb: 97, betToBb: 90 });
    // P2 only has 10bb behind — their allin doesn't reach P1's 90bb bet.
    const next = applyPostflopAction(state, "P2", "allin", { effectiveStackBb: 10 });
    expect(next.committed.P2).toBe(10);
    expect(next.currentBetToCall).toBe(90); // unchanged
    expect(next.lastAggressor).toBe("P1"); // unchanged
  });
});
