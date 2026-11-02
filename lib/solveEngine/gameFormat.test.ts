import { describe, expect, it } from "vitest";
import { loadEquityMatrix } from "@/lib/equity/loadEquityMatrix";
import { HAND_BY_LABEL } from "@/lib/handRange/handList";
import type { ActionType, HandFrequency, Position } from "@/types/rangeData";
import { computeAvailableActions, computeRawRaiseTo } from "./actionSizing";
import { GAME_FORMATS, TOURNAMENT_8, gameFormatById, type GameFormat } from "./gameFormat";
import { initialPotState } from "./potState";
import { computeRoundActingOrder } from "./preview";
import { replayActionPath } from "./replay";
import { solveActiveSeat } from "./solve";

const matrix = loadEquityMatrix();
const CASH_6 = gameFormatById("cash-6")!;
const CASH_8 = gameFormatById("cash-8")!;

function path(format: GameFormat, ...steps: [Position, ActionType][]) {
  const actionPath = steps.map(([actor, action]) => ({ actor, action }));
  const result = replayActionPath(actionPath, 100, format);
  if (result.status === "invalid") throw new Error(result.reason);
  return result;
}

function playedShare(hands: HandFrequency[]): number {
  return hands.reduce((sum, h) => sum + (1 - h.fold) * HAND_BY_LABEL.get(h.hand)!.combos, 0) / 1326;
}

describe("gameFormatById", () => {
  it("finds every format and rejects anything else", () => {
    for (const format of GAME_FORMATS) expect(gameFormatById(format.id)).toBe(format);
    expect(gameFormatById("cash-9")).toBeUndefined();
  });
});

describe("cash seats", () => {
  it("6-max starts at LJ and acts around the six seats it has", () => {
    const result = path(CASH_6);
    expect(result).toMatchObject({ status: "active", activeSeat: "LJ" });
    expect(computeRoundActingOrder([], "LJ", 100, CASH_6)).toEqual(["LJ", "HJ", "CO", "BTN", "SB", "BB"]);
  });

  it("8-max starts at UTG, like the tournament", () => {
    expect(path(CASH_8)).toMatchObject({ status: "active", activeSeat: "UTG" });
  });

  it("6-max wraps from the BB back to LJ when a raise reopens the action", () => {
    const result = path(
      CASH_6,
      ["LJ", "raise"],
      ["HJ", "fold"],
      ["CO", "fold"],
      ["BTN", "fold"],
      ["SB", "fold"],
      ["BB", "raise"],
    );
    expect(result).toMatchObject({ status: "active", activeSeat: "LJ" });
  });

  it("6-max rejects a seat it doesn't have", () => {
    const result = replayActionPath([{ actor: "UTG", action: "fold" }], 100, CASH_6);
    expect(result).toEqual({ status: "invalid", reason: "expected LJ to act, got UTG" });
  });
});

describe("cash pots and sizes", () => {
  it("starts from the blinds alone", () => {
    expect(initialPotState(CASH_6).potBb).toBe(1.5);
    expect(initialPotState(CASH_8).potBb).toBe(1.5);
    expect(initialPotState(TOURNAMENT_8).potBb).toBe(2.5);
  });

  it("opens 2.5bb from every seat and 3bb from the SB, at every stack", () => {
    const state = initialPotState(CASH_8);
    for (const seat of ["UTG", "UTG1", "LJ", "HJ", "CO", "BTN"] as const) {
      for (const stack of [40, 70, 100]) expect(computeRawRaiseTo(seat, state, stack)).toBe(2.5);
    }
    for (const stack of [40, 70, 100]) expect(computeRawRaiseTo("SB", state, stack)).toBe(3);
  });

  it("puts a BTN open and BB call to the flop in a 5.5bb pot", () => {
    const result = path(
      CASH_6,
      ["LJ", "fold"],
      ["HJ", "fold"],
      ["CO", "fold"],
      ["BTN", "raise"],
      ["SB", "fold"],
      ["BB", "call"],
    );
    expect(result).toMatchObject({ status: "resolved", reason: "action-closed" });
    expect(result.potState.potBb).toBe(5.5);
  });

  it("gives the SB no limp", () => {
    const state = path(CASH_8, ...(["UTG", "UTG1", "LJ", "HJ", "CO", "BTN"] as const).map((s) => [s, "fold"] as [Position, ActionType]));
    expect(state.status === "active" && state.activeSeat).toBe("SB");
    expect(computeAvailableActions("SB", state.potState, 100).call).toBeNull();
  });
});

describe("cash ranges", () => {
  it("opens each seat wider than the last, up to the button, with the SB raising or folding", () => {
    const seats = ["UTG", "UTG1", "LJ", "HJ", "CO", "BTN"] as const;
    const widths = seats.map((seat) => playedShare(solveActiveSeat(matrix, seat, initialPotState(CASH_8), 100).hands));
    expect(widths).toEqual([...widths].sort((a, b) => a - b));
    expect(widths[0]).toBeCloseTo(0.12, 1);
    expect(widths[5]).toBeCloseTo(0.46, 1);

    const sb = solveActiveSeat(matrix, "SB", initialPotState(CASH_8), 100).hands;
    expect(sb.every((h) => h.call === 0)).toBe(true);
    expect(playedShare(sb)).toBeCloseTo(0.38, 1);
  });

  it("shares one LJ chart between 6-max and 8-max", () => {
    const six = solveActiveSeat(matrix, "LJ", initialPotState(CASH_6), 100).hands;
    const eight = solveActiveSeat(matrix, "LJ", initialPotState(CASH_8), 100).hands;
    expect(six).toEqual(eight);
  });

  it("shoves tighter than the tournament without an ante to win", () => {
    const shove = (format: GameFormat) => playedShare(solveActiveSeat(matrix, "BTN", initialPotState(format), 10).hands);
    expect(shove(CASH_8)).toBeLessThan(shove(TOURNAMENT_8));
  });
});
