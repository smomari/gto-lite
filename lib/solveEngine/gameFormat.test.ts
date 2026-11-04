import { describe, expect, it } from "vitest";
import { loadEquityMatrix } from "@/lib/equity/loadEquityMatrix";
import { HAND_BY_LABEL } from "@/lib/handRange/handList";
import type { ActionType, HandFrequency, Position } from "@/types/rangeData";
import { computeAvailableActions, computeRawRaiseTo } from "./actionSizing";
import { GAME_FORMATS, TOURNAMENT_8, firstInWidthsUnder, gameFormatById, type GameFormat } from "./gameFormat";
import { initialPotState, type PotState } from "./potState";
import { computeRoundActingOrder } from "./preview";
import { DEFAULT_RAKE_SETTINGS, NO_RAKE_SETTINGS, rakeById, type RakeSettings } from "./rake";
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

  it("opens 2.5bb from every seat and 3.5bb from the SB, at every stack", () => {
    const state = initialPotState(CASH_8);
    for (const seat of ["UTG", "UTG1", "LJ", "HJ", "CO", "BTN"] as const) {
      for (const stack of [40, 70, 100]) expect(computeRawRaiseTo(seat, state, stack)).toBe(2.5);
    }
    for (const stack of [40, 70, 100]) expect(computeRawRaiseTo("SB", state, stack)).toBe(3.5);
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

  it("re-raises by position against the raiser", () => {
    const btnOpen = path(CASH_6, ["LJ", "fold"], ["HJ", "fold"], ["CO", "fold"], ["BTN", "raise"]);
    expect(btnOpen.status === "active" && computeRawRaiseTo("SB", btnOpen.potState, 100)).toBe(11);
    const toBb = path(CASH_6, ["LJ", "fold"], ["HJ", "fold"], ["CO", "fold"], ["BTN", "raise"], ["SB", "fold"]);
    expect(toBb.status === "active" && computeRawRaiseTo("BB", toBb.potState, 100)).toBe(13.5);
    const coOpen = path(CASH_6, ["LJ", "fold"], ["HJ", "fold"], ["CO", "raise"]);
    expect(coOpen.status === "active" && computeRawRaiseTo("BTN", coOpen.potState, 100)).toBe(8);
    const sbOpen = path(CASH_6, ["LJ", "fold"], ["HJ", "fold"], ["CO", "fold"], ["BTN", "fold"], ["SB", "raise"]);
    // The BB 3-bets the SB 3x, as GTO Wizard's NL10 does, not the 3.2x of an in-position 3-bet.
    expect(sbOpen.status === "active" && computeRawRaiseTo("BB", sbOpen.potState, 100)).toBe(10.5);
    const threeBet = path(CASH_6, ["LJ", "fold"], ["HJ", "fold"], ["CO", "fold"], ["BTN", "raise"], ["SB", "fold"], ["BB", "raise"]);
    expect(threeBet.status === "active" && computeRawRaiseTo("BTN", threeBet.potState, 100)).toBe(28.5);
  });

  it("lets the SB limp above the push/fold stacks", () => {
    const state = path(CASH_8, ...(["UTG", "UTG1", "LJ", "HJ", "CO", "BTN"] as const).map((s) => [s, "fold"] as [Position, ActionType]));
    expect(state.status === "active" && state.activeSeat).toBe("SB");
    expect(computeAvailableActions("SB", state.potState, 100).call).toEqual({ label: "Limp", amountBb: 0.5 });
  });
});

describe("cash ranges", () => {
  it("opens each seat wider than the last, up to the button, with the SB mixing raises and limps", () => {
    const seats = ["UTG", "UTG1", "LJ", "HJ", "CO", "BTN"] as const;
    const widths = seats.map((seat) => playedShare(solveActiveSeat(matrix, seat, initialPotState(CASH_8), 100).hands));
    expect(widths).toEqual([...widths].sort((a, b) => a - b));
    expect(widths[0]).toBeCloseTo(0.12, 1);
    expect(widths[5]).toBeCloseTo(0.4, 1);

    const sb = solveActiveSeat(matrix, "SB", initialPotState(CASH_8), 100).hands;
    const share = (k: (h: HandFrequency) => number) => sb.reduce((sum, h) => sum + k(h) * HAND_BY_LABEL.get(h.hand)!.combos, 0) / 1326;
    expect(share((h) => h.raise + (h.allin ?? 0))).toBeCloseTo(0.34, 1);
    expect(share((h) => h.call)).toBeCloseTo(0.15, 1);
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

describe("rake", () => {
  const preset = (id: string, noFlopNoDrop = true): RakeSettings => ({ structure: rakeById(id)!, noFlopNoDrop });
  const btnOpen = (rake: RakeSettings) => playedShare(solveActiveSeat(matrix, "BTN", initialPotState(CASH_8), 100, rake).hands);
  const bbVsBtn = (rake: RakeSettings) => {
    const result = path(
      CASH_8,
      ...(["UTG", "UTG1", "LJ", "HJ", "CO"] as const).map((s) => [s, "fold"] as [Position, ActionType]),
      ["BTN", "raise"],
      ["SB", "fold"],
    );
    if (result.status !== "active") throw new Error("expected BB to act");
    return solveActiveSeat(matrix, "BB", result.potState, 100, rake).hands;
  };

  it("keeps the cash table as drawn at the default rake", () => {
    expect(firstInWidthsUnder(CASH_8, DEFAULT_RAKE_SETTINGS)).toEqual(CASH_8.firstInWidths);
  });

  it("opens and defends tighter as rake grows", () => {
    const order = [NO_RAKE_SETTINGS, preset("online-high"), preset("online-mid"), preset("online-std"), preset("online-low"), preset("live")];
    const opens = order.map(btnOpen);
    const defends = order.map((rake) => playedShare(bbVsBtn(rake)));
    expect([...opens].sort((a, b) => b - a)).toEqual(opens);
    expect([...defends].sort((a, b) => b - a)).toEqual(defends);
    expect(opens[0]).toBeGreaterThan(opens[5] + 0.03);
    expect(defends[0]).toBeGreaterThan(defends[5] + 0.08);
  });

  it("tightens opens further when stolen blinds pay rake too", () => {
    expect(btnOpen(preset("live", false))).toBeLessThan(btnOpen(preset("live")));
  });

  it("calls a shove tighter under rake, which lets the shover widen", () => {
    const steps = ["UTG", "UTG1", "LJ", "HJ", "CO"].map((actor) => ({ actor: actor as Position, action: "fold" as const }));
    const facingShove = replayActionPath([...steps, { actor: "BTN", action: "allin" }, { actor: "SB", action: "fold" }], 10, CASH_8);
    if (facingShove.status !== "active") throw new Error("expected BB to act");
    const share = (seat: Position, state: PotState, rake: RakeSettings) => playedShare(solveActiveSeat(matrix, seat, state, 10, rake).hands);
    expect(share("BB", facingShove.potState, preset("live"))).toBeLessThan(share("BB", facingShove.potState, NO_RAKE_SETTINGS));
    expect(share("BTN", initialPotState(CASH_8), preset("live"))).toBeGreaterThan(share("BTN", initialPotState(CASH_8), NO_RAKE_SETTINGS));
  });

  it("leaves the tournament alone", () => {
    const hands = (rake: RakeSettings) => solveActiveSeat(matrix, "BTN", initialPotState(TOURNAMENT_8), 100, rake).hands;
    expect(firstInWidthsUnder(TOURNAMENT_8, DEFAULT_RAKE_SETTINGS)).toBe(TOURNAMENT_8.firstInWidths);
    expect(hands(NO_RAKE_SETTINGS)).toEqual(solveActiveSeat(matrix, "BTN", initialPotState(TOURNAMENT_8), 100).hands);
  });

describe("multiway", () => {
  const steps = (...moves: string[]) => moves.map((m) => m.split(":") as [Position, ActionType]);
  const facing = (format: GameFormat, ...moves: string[]) => {
    const result = path(format, ...steps(...moves));
    if (result.status !== "active") throw new Error("expected a seat to act");
    return result;
  };

  it("sizes a squeeze up for each caller, in cash only", () => {
    const oneCaller = facing(CASH_8, "UTG:raise", "UTG1:call", "LJ:fold", "HJ:fold", "CO:fold", "BTN:fold", "SB:fold");
    expect(computeRawRaiseTo("BB", oneCaller.potState, 100)).toBe(14);
    const twoCallers = facing(CASH_8, "UTG:raise", "UTG1:call", "LJ:call", "HJ:fold", "CO:fold", "BTN:fold", "SB:fold");
    expect(computeRawRaiseTo("BB", twoCallers.potState, 100)).toBe(16.5);
    const tournament = facing(TOURNAMENT_8, "UTG:raise", "UTG1:call", "LJ:fold", "HJ:fold", "CO:fold", "BTN:fold", "SB:fold");
    expect(computeRawRaiseTo("BB", tournament.potState, 100)).toBe(computeRawRaiseTo("BB", facing(TOURNAMENT_8, "UTG:raise", "UTG1:fold", "LJ:fold", "HJ:fold", "CO:fold", "BTN:fold", "SB:fold").potState, 100));
  });

  it("overcalls less behind a caller in position than one out of position, without touching the 3-bets", () => {
    const flats = (...moves: string[]) => {
      const state = facing(CASH_6, ...moves);
      const hands = solveActiveSeat(matrix, "BB", state.potState, 100, DEFAULT_RAKE_SETTINGS).hands;
      return { call: hands.reduce((s, h) => s + h.call * HAND_BY_LABEL.get(h.hand)!.combos, 0), raise: hands.map((h) => h.raise) };
    };
    const headsUp = flats("LJ:fold", "HJ:fold", "CO:fold", "BTN:raise", "SB:fold");
    const behindSb = flats("LJ:fold", "HJ:fold", "CO:fold", "BTN:raise", "SB:call");
    expect(behindSb.call).toBeLessThan(headsUp.call);
    const coOpen = flats("LJ:fold", "HJ:fold", "CO:raise", "BTN:fold", "SB:fold");
    const behindBtn = flats("LJ:fold", "HJ:fold", "CO:raise", "BTN:call", "SB:fold");
    expect(behindBtn.call / coOpen.call).toBeLessThan(behindSb.call / headsUp.call);
    expect(behindBtn.raise).toEqual(coOpen.raise);
  });

  it.each([["cash", CASH_8], ["tournament", TOURNAMENT_8]] as const)("leaves a %s cold caller facing a squeeze some calls", (_, format) => {
    const state = facing(format, "UTG:raise", "UTG1:call", "LJ:fold", "HJ:fold", "CO:fold", "BTN:fold", "SB:fold", "BB:raise", "UTG:fold");
    const hands = solveActiveSeat(matrix, "UTG1", state.potState, 100, format.allowsRake ? DEFAULT_RAKE_SETTINGS : NO_RAKE_SETTINGS).hands;
    const raises = hands.reduce((s, h) => s + h.raise * HAND_BY_LABEL.get(h.hand)!.combos, 0);
    const calls = hands.reduce((s, h) => s + h.call * HAND_BY_LABEL.get(h.hand)!.combos, 0);
    expect(calls).toBeGreaterThan(raises);
  });
});
});
