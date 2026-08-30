import { describe, expect, it } from "vitest";
import { replayActionPath } from "./replay";

describe("replayActionPath — legal sequences", () => {
  it("simple RFI: everyone before CO folds, CO's opening decision comes up next", () => {
    // UTG, UTG1, LJ, HJ fold; CO is next to act (opening decision, no raise yet).
    const result = replayActionPath(
      [
        { actor: "UTG", action: "fold" },
        { actor: "UTG1", action: "fold" },
        { actor: "LJ", action: "fold" },
        { actor: "HJ", action: "fold" },
      ],
      100,
    );
    expect(result.status).toBe("active");
    if (result.status === "active") expect(result.activeSeat).toBe("CO");
  });

  it("handles one level of reopening: LJ opens, everyone folds around, BB 3-bets, LJ calls", () => {
    const result = replayActionPath(
      [
        { actor: "UTG", action: "fold" },
        { actor: "UTG1", action: "fold" },
        { actor: "LJ", action: "raise" },
        { actor: "HJ", action: "fold" },
        { actor: "CO", action: "fold" },
        { actor: "BTN", action: "fold" },
        { actor: "SB", action: "fold" },
        { actor: "BB", action: "raise" },
        { actor: "LJ", action: "call" },
      ],
      100,
    );
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") expect(result.reason).toBe("action-closed");
  });

  it("handles two levels of reopening: LJ opens, BB 3-bets, LJ 4-bets, BB calls", () => {
    const result = replayActionPath(
      [
        { actor: "UTG", action: "fold" },
        { actor: "UTG1", action: "fold" },
        { actor: "LJ", action: "raise" },
        { actor: "HJ", action: "fold" },
        { actor: "CO", action: "fold" },
        { actor: "BTN", action: "fold" },
        { actor: "SB", action: "fold" },
        { actor: "BB", action: "raise" },
        { actor: "LJ", action: "raise" },
        { actor: "BB", action: "call" },
      ],
      100,
    );
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") expect(result.reason).toBe("action-closed");
  });

  it("recomputes canonical labels: open, 3bet, 4bet in order", () => {
    const result = replayActionPath(
      [
        { actor: "UTG", action: "fold" },
        { actor: "UTG1", action: "fold" },
        { actor: "LJ", action: "raise" },
        { actor: "HJ", action: "fold" },
        { actor: "CO", action: "fold" },
        { actor: "BTN", action: "fold" },
        { actor: "SB", action: "fold" },
        { actor: "BB", action: "raise" },
        { actor: "LJ", action: "raise" },
      ],
      100,
    );
    expect(result.status).toBe("active");
    if (result.status !== "active") throw new Error("expected active");
    const labels = result.canonicalActionPath.filter((n) => n.action !== "fold").map((n) => n.label);
    expect(labels).toEqual(["open", "3bet", "4bet"]);
  });

  it("server-canonical sizeBb ignores whatever the client sent, including on a reopened seat's second action", () => {
    const result = replayActionPath(
      [
        { actor: "UTG", action: "raise" }, // UTG opens
        { actor: "UTG1", action: "fold" },
        { actor: "LJ", action: "fold" },
        { actor: "HJ", action: "fold" },
        { actor: "CO", action: "fold" },
        { actor: "BTN", action: "fold" },
        { actor: "SB", action: "fold" },
        { actor: "BB", action: "raise" }, // BB 3-bets
        { actor: "UTG", action: "raise" }, // UTG reopens with a 4-bet, sized off BB's 3-bet
      ],
      100,
    );
    expect(result.status).toBe("active");
    if (result.status !== "active") throw new Error("expected active");
    const utgNodes = result.canonicalActionPath.filter((n) => n.actor === "UTG");
    expect(utgNodes).toHaveLength(2);
    expect(utgNodes[0].sizeBb).toBe(4); // UTG's own open: 4bb (OOP)
    expect(utgNodes[1].label).toBe("4bet");
    expect(utgNodes[1].sizeBb).toBe(4 * 3 * 4); // BB's 3bet (4*3=12) re-raised 4x (UTG OOP vs BB)
  });

  it("normalizes a raise that would collapse into an allin, rather than rejecting it", () => {
    // 12bb stack: UTG opens 4bb; UTG1's reactive raise (4*3=12) exactly equals
    // the stack, so sizing collapses it into an allin — the client requesting
    // "raise" here should be accepted and normalized, not rejected.
    const result = replayActionPath(
      [
        { actor: "UTG", action: "raise" },
        { actor: "UTG1", action: "raise" },
      ],
      12,
    );
    expect(result.status).toBe("active");
    if (result.status !== "active") throw new Error("expected active");
    const utg1Node = result.canonicalActionPath.find((n) => n.actor === "UTG1")!;
    expect(utg1Node.action).toBe("allin");
    expect(utg1Node.sizeBb).toBe(12);
  });
});

describe("replayActionPath — illegal sequences", () => {
  it("rejects the wrong actor for the computed next turn", () => {
    const result = replayActionPath([{ actor: "BB", action: "raise" }], 100);
    expect(result.status).toBe("invalid");
  });

  it("rejects a call before any raise has occurred", () => {
    const result = replayActionPath([{ actor: "UTG", action: "call" }], 100);
    expect(result.status).toBe("invalid");
  });

  it("rejects an action supplied after the hand already resolved (uncontested)", () => {
    const result = replayActionPath(
      [
        { actor: "UTG", action: "fold" },
        { actor: "UTG1", action: "fold" },
        { actor: "LJ", action: "fold" },
        { actor: "HJ", action: "fold" },
        { actor: "CO", action: "fold" },
        { actor: "BTN", action: "fold" },
        { actor: "SB", action: "fold" },
        { actor: "BB", action: "fold" }, // BB can't even act — hand is already uncontested before this
      ],
      100,
    );
    expect(result.status).toBe("invalid");
  });

  it("rejects an action supplied after the hand already resolved (action-closed)", () => {
    const result = replayActionPath(
      [
        { actor: "UTG", action: "fold" },
        { actor: "UTG1", action: "fold" },
        { actor: "LJ", action: "fold" },
        { actor: "HJ", action: "fold" },
        { actor: "CO", action: "fold" },
        { actor: "BTN", action: "raise" },
        { actor: "SB", action: "call" },
        { actor: "BB", action: "call" },
        { actor: "BTN", action: "raise" }, // action already closed once BB called
      ],
      100,
    );
    expect(result.status).toBe("invalid");
  });
});
