import { describe, expect, it } from "vitest";
import { initialPotState, applyAction } from "./potState";
import { computeNextActor, nextLiveSeatAfter } from "./rotation";

const STACK = 100;
const raise = (state: ReturnType<typeof initialPotState>, actor: string, toBb: number) =>
  applyAction(state, actor as never, "raise", { effectiveStackBb: STACK, raiseToBb: toBb });
const fold = (state: ReturnType<typeof initialPotState>, actor: string) =>
  applyAction(state, actor as never, "fold", { effectiveStackBb: STACK });
const call = (state: ReturnType<typeof initialPotState>, actor: string) =>
  applyAction(state, actor as never, "call", { effectiveStackBb: STACK });

describe("nextLiveSeatAfter", () => {
  it("returns UTG when starting from null (hand hasn't started)", () => {
    expect(nextLiveSeatAfter(null, new Set())).toBe("UTG");
  });

  it("skips folded seats", () => {
    expect(nextLiveSeatAfter("UTG", new Set(["UTG1", "LJ"]))).toBe("HJ");
  });

  it("wraps past BB back to UTG", () => {
    expect(nextLiveSeatAfter("BB", new Set())).toBe("UTG");
  });
});

describe("computeNextActor", () => {
  it("UTG acts first when the hand hasn't started", () => {
    const result = computeNextActor(initialPotState());
    expect(result).toEqual({ type: "active", seat: "UTG" });
  });

  it("uncontested: everyone folds to BB with no raise ever", () => {
    let state = initialPotState();
    for (const seat of ["UTG", "UTG1", "LJ", "HJ", "CO", "BTN", "SB"]) {
      state = fold(state, seat);
      const next = computeNextActor(state);
      if (seat !== "SB") {
        expect(next.type).toBe("active"); // BB not yet the sole survivor
      }
    }
    expect(computeNextActor(state)).toEqual({ type: "resolved", reason: "uncontested" });
  });

  it("uncontested: everyone folds out after a raise, same reason as the no-raise walk", () => {
    let state = initialPotState();
    state = fold(state, "UTG");
    state = raise(state, "UTG1", 4);
    for (const seat of ["LJ", "HJ", "CO", "BTN", "SB", "BB"]) {
      state = fold(state, seat);
    }
    expect(computeNextActor(state)).toEqual({ type: "resolved", reason: "uncontested" });
  });

  it("action-closed: rotation returns to the last aggressor with 2+ live seats", () => {
    let state = initialPotState();
    for (const seat of ["UTG", "UTG1", "LJ", "HJ", "CO"]) state = fold(state, seat);
    state = raise(state, "BTN", 3);
    state = call(state, "SB");
    state = call(state, "BB");
    // Rotation wraps: after BB, next live is BTN (UTG..CO all folded) — the raiser itself.
    expect(computeNextActor(state)).toEqual({ type: "resolved", reason: "action-closed" });
  });

  it("reopens action for an already-acted, still-live seat after a later 3-bet", () => {
    let state = initialPotState();
    state = raise(state, "UTG", 4); // UTG opens
    state = call(state, "UTG1"); // UTG1 calls
    state = raise(state, "LJ", 12); // LJ 3-bets
    for (const seat of ["HJ", "CO", "BTN", "SB", "BB"]) state = fold(state, seat);
    // UTG and UTG1 already acted once each, but both are still live and haven't
    // faced LJ's 3-bet yet — action must reopen for UTG first (seat order).
    expect(computeNextActor(state)).toEqual({ type: "active", seat: "UTG" });
    state = call(state, "UTG");
    expect(computeNextActor(state)).toEqual({ type: "active", seat: "UTG1" });
    state = fold(state, "UTG1");
    expect(computeNextActor(state)).toEqual({ type: "resolved", reason: "action-closed" });
  });
});
