import { describe, expect, it } from "vitest";
import { computeRoundActingOrder, previewQuickAction } from "./preview";

describe("computeRoundActingOrder", () => {
  it("returns the full table order in round 1, starting with the active seat", () => {
    expect(computeRoundActingOrder([], "UTG", 100)).toEqual([
      "UTG",
      "UTG1",
      "LJ",
      "HJ",
      "CO",
      "BTN",
      "SB",
      "BB",
    ]);
  });

  it("stops before the last aggressor once someone has raised", () => {
    const actionPath = [{ actor: "UTG" as const, action: "raise" as const }];
    expect(computeRoundActingOrder(actionPath, "UTG1", 100)).toEqual([
      "UTG1",
      "LJ",
      "HJ",
      "CO",
      "BTN",
      "SB",
      "BB",
    ]);
  });

  it("returns [] when actionPath doesn't actually land on activeSeat", () => {
    expect(computeRoundActingOrder([], "CO", 100)).toEqual([]);
  });

  it("includes every seat still owing a decision after a reopen, not just the raiser", () => {
    // UTG opens, UTG1/LJ fold, HJ calls, CO/BTN/SB fold, BB 3-bets — reopening
    // for BOTH UTG and HJ (the two seats still live besides BB).
    const actionPath = [
      { actor: "UTG" as const, action: "raise" as const },
      { actor: "UTG1" as const, action: "fold" as const },
      { actor: "LJ" as const, action: "fold" as const },
      { actor: "HJ" as const, action: "call" as const },
      { actor: "CO" as const, action: "fold" as const },
      { actor: "BTN" as const, action: "fold" as const },
      { actor: "SB" as const, action: "fold" as const },
      { actor: "BB" as const, action: "raise" as const },
    ];
    expect(computeRoundActingOrder(actionPath, "UTG", 100)).toEqual(["UTG", "HJ"]);
  });

  it("terminates in a heads-up raise war (no infinite loop)", () => {
    const actionPath = [
      { actor: "UTG" as const, action: "raise" as const },
      { actor: "UTG1" as const, action: "fold" as const },
      { actor: "LJ" as const, action: "fold" as const },
      { actor: "HJ" as const, action: "fold" as const },
      { actor: "CO" as const, action: "fold" as const },
      { actor: "BTN" as const, action: "fold" as const },
      { actor: "SB" as const, action: "fold" as const },
      { actor: "BB" as const, action: "raise" as const },
    ];
    expect(computeRoundActingOrder(actionPath, "UTG", 100)).toEqual(["UTG"]);
  });
});

describe("previewQuickAction", () => {
  it("returns null when the target isn't after the active seat", () => {
    expect(previewQuickAction([], "UTG", "UTG", 100)).toBeNull();
    expect(previewQuickAction([], "CO", "UTG", 100)).toBeNull();
  });

  it("computes CO's real opening options when everyone before it folds", () => {
    const actions = previewQuickAction([], "UTG", "CO", 100);
    expect(actions).not.toBeNull();
    expect(actions!.call).toBeNull(); // opening decision, nothing to call
    expect(actions!.raise).toEqual({ toBb: 3 }); // CO is IP-half: 3x BB
    expect(actions!.allin).toEqual({ toBb: 100 });
  });

  it("returns null for BB when folding everyone else would already resolve the hand", () => {
    expect(previewQuickAction([], "UTG", "BB", 100)).toBeNull();
  });

  it("computes BB's real options once an aggressor already exists in the path", () => {
    const actionPath = [{ actor: "UTG" as const, action: "raise" as const }];
    const actions = previewQuickAction(actionPath, "UTG1", "BB", 100);
    expect(actions).not.toBeNull();
    expect(actions!.call).not.toBeNull();
  });

  it("matches actual replay: folding UTG..HJ then previewing CO agrees with a direct replay to CO", () => {
    const actions = previewQuickAction([], "UTG", "CO", 40);
    expect(actions).toEqual({
      fold: true,
      call: null,
      raise: { toBb: 3 },
      allin: { toBb: 40 },
    });
  });

  it("computes HJ's real facing-the-3bet options after UTG's open gets reopened by BB (old SEAT_ORDER.slice logic broke this)", () => {
    const actionPath = [
      { actor: "UTG" as const, action: "raise" as const },
      { actor: "UTG1" as const, action: "fold" as const },
      { actor: "LJ" as const, action: "fold" as const },
      { actor: "HJ" as const, action: "call" as const },
      { actor: "CO" as const, action: "fold" as const },
      { actor: "BTN" as const, action: "fold" as const },
      { actor: "SB" as const, action: "fold" as const },
      { actor: "BB" as const, action: "raise" as const },
    ];
    const actions = previewQuickAction(actionPath, "UTG", "HJ", 100);
    expect(actions).not.toBeNull();
    expect(actions!.call).not.toBeNull();
  });
});
