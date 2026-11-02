import { describe, expect, it } from "vitest";
import { replayActionPath } from "./replay";
import { TOURNAMENT_8 } from "@/lib/solveEngine/gameFormat";

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
      TOURNAMENT_8,
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
      TOURNAMENT_8,
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
      TOURNAMENT_8,
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
      TOURNAMENT_8,
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
      TOURNAMENT_8,
    );
    expect(result.status).toBe("active");
    if (result.status !== "active") throw new Error("expected active");
    const utgNodes = result.canonicalActionPath.filter((n) => n.actor === "UTG");
    expect(utgNodes).toHaveLength(2);
    expect(utgNodes[0].sizeBb).toBe(2.8); // UTG's own open: OOP deep size (100bb stack)
    expect(utgNodes[1].label).toBe("4bet");
    expect(utgNodes[1].sizeBb).toBe(33.6); // BB's 3bet (2.8*4=11.2, BB OOP) re-raised 3x (UTG IP vs BB) = 33.6
  });

  it("normalizes an allin facing an all-in into a call", () => {
    const folds = ["UTG1", "LJ", "HJ", "CO", "BTN", "SB"] as const;
    const result = replayActionPath(
      [
        { actor: "UTG", action: "allin" },
        ...folds.map((actor) => ({ actor, action: "fold" as const })),
        { actor: "BB", action: "allin" },
      ],
      20,
      TOURNAMENT_8,
    );
    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") throw new Error("expected resolved");
    expect(result.reason).toBe("action-closed");
    const bbNode = result.canonicalActionPath.find((n) => n.actor === "BB")!;
    expect(bbNode.action).toBe("call");
    expect(bbNode.sizeBb).toBe(20);
  });

  it("closes the action at the minimum 2bb stack when everyone goes all-in", () => {
    const seats = ["UTG", "UTG1", "LJ", "HJ", "CO", "BTN", "SB", "BB"] as const;
    const result = replayActionPath(seats.map((actor) => ({ actor, action: "allin" as const })), 2, TOURNAMENT_8);
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") expect(result.reason).toBe("action-closed");
  });

  it("normalizes a raise that would collapse into an allin, rather than rejecting it", () => {
    // Only all-in is offered at the push/fold stacks, but a client requesting
    // "raise" there should be accepted and normalized, not rejected.
    const result = replayActionPath([{ actor: "UTG", action: "raise" }], 10, TOURNAMENT_8);
    expect(result.status).toBe("active");
    if (result.status !== "active") throw new Error("expected active");
    const utgNode = result.canonicalActionPath.find((n) => n.actor === "UTG")!;
    expect(utgNode.action).toBe("allin");
    expect(utgNode.sizeBb).toBe(10);
  });
});

const foldsToSb = (["UTG", "UTG1", "LJ", "HJ", "CO", "BTN"] as const).map((actor) => ({ actor, action: "fold" }) as const);

describe("replayActionPath — limped pots", () => {
  it("closes the action when BB checks behind SB's limp", () => {
    const result = replayActionPath([...foldsToSb, { actor: "SB", action: "call" }, { actor: "BB", action: "call" }], 40, TOURNAMENT_8);
    expect(result).toMatchObject({ status: "resolved", reason: "action-closed" });
    if (result.status !== "resolved") return;
    expect(result.potState.committed).toMatchObject({ SB: 1, BB: 1 });
    expect(result.canonicalActionPath.slice(-2).map((n) => n.label)).toEqual(["limp", "check"]);
  });

  it("sends the action back to SB after BB raises a limp", () => {
    const result = replayActionPath([...foldsToSb, { actor: "SB", action: "call" }, { actor: "BB", action: "raise" }], 40, TOURNAMENT_8);
    expect(result).toMatchObject({ status: "active", activeSeat: "SB" });
    if (result.status !== "active") return;
    expect(result.potState.committed.BB).toBe(3.5);
  });

  it("rejects a limp from any other seat, at push/fold stacks, and a BB fold when checking is free", () => {
    expect(replayActionPath([{ actor: "UTG", action: "call" }], 40, TOURNAMENT_8).status).toBe("invalid");
    expect(replayActionPath([...foldsToSb, { actor: "SB", action: "call" }], 15, TOURNAMENT_8).status).toBe("invalid");
    expect(replayActionPath([...foldsToSb, { actor: "SB", action: "call" }, { actor: "BB", action: "fold" }], 40, TOURNAMENT_8).status).toBe("invalid");
  });
});

describe("replayActionPath — illegal sequences", () => {
  it("rejects the wrong actor for the computed next turn", () => {
    const result = replayActionPath([{ actor: "BB", action: "raise" }], 100, TOURNAMENT_8);
    expect(result.status).toBe("invalid");
  });

  it("rejects a call before any raise has occurred", () => {
    const result = replayActionPath([{ actor: "UTG", action: "call" }], 100, TOURNAMENT_8);
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
      TOURNAMENT_8,
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
      TOURNAMENT_8,
    );
    expect(result.status).toBe("invalid");
  });
});
