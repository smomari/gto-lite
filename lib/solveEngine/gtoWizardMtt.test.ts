import { describe, expect, it } from "vitest";
import { loadEquityMatrix } from "@/lib/equity/loadEquityMatrix";
import { HAND_BY_LABEL, TOTAL_COMBOS } from "@/lib/handRange/handList";
import type { ActionType, HandFrequency, Position } from "@/types/rangeData";
import { computeAvailableActions } from "./actionSizing";
import { TOURNAMENT_8 } from "./gameFormat";
import { replayActionPath } from "./replay";
import { solveActiveSeat } from "./solve";

/**
 * The tournament charts are tuned to aggregate frequencies from GTO Wizard's
 * MTT 8max ChipEV solutions (symmetric stacks, a 1bb ante in a 2.5bb pot,
 * like ours), read off its screen on 2026-11-03 at 100bb, 40bb and 20bb:
 * raise (including all-in) / call / fold, % of all hands, or of the hands
 * that reached the spot where noted. These tests keep the tuning in place.
 */
const matrix = loadEquityMatrix();
const TOLERANCE = 3;
const SEATS = ["UTG", "UTG1", "LJ", "HJ", "CO"];

const steps = (...moves: string[]) =>
  moves.map((move) => {
    const [actor, action] = move.split(":");
    return { actor: actor as Position, action: action as ActionType };
  });
const foldsTo = (seat: string) => SEATS.slice(0, seat === "BTN" ? SEATS.length : SEATS.indexOf(seat)).map((s) => `${s}:fold`);

function spot(stack: number, moves: string[]) {
  const result = replayActionPath(steps(...moves), stack, TOURNAMENT_8);
  if (result.status !== "active") throw new Error("expected a seat to act");
  return {
    hands: solveActiveSeat(matrix, result.activeSeat, result.potState, stack).hands,
    raiseTo: computeAvailableActions(result.activeSeat, result.potState, stack).raise?.toBb,
  };
}

const share = (hands: HandFrequency[], weight: (h: HandFrequency, i: number) => number) =>
  (100 * hands.reduce((sum, h, i) => sum + weight(h, i) * HAND_BY_LABEL.get(h.hand)!.combos, 0)) / TOTAL_COMBOS;
const raised = (h: HandFrequency) => h.raise + (h.allin ?? 0);
const ofAll = (hands: HandFrequency[]) => [share(hands, raised), share(hands, (h) => h.call), share(hands, (h) => h.fold)];

function expectNear(got: number[], want: number[]) {
  got.forEach((value, i) => expect(Math.abs(value - want[i])).toBeLessThanOrEqual(TOLERANCE));
}

const GTO_WIZARD = {
  100: { opens: [16.9, 23.2, 28.5, 37.1, 54.4], sb: [9.0, 81.4, 9.6], sbVsBtn: [15.3, 15.4, 69.3], bbVsBtn: [14.4, 62.8, 22.8], btnVs3bet: [6.4, 36.6, 57.0] },
  40: { opens: [17.5, 24.3, 28.8, 38.0, 52.0], sb: [25.2, 60.1, 14.8], sbVsBtn: [17.9, 13.1, 69.0], bbVsBtn: [16.9, 71.2, 11.9], btnVs3bet: [11.1, 38.1, 50.8] },
  20: { opens: [17.2, 22.0, 25.9, 31.8, 41.5], sb: [30.6, 54.2, 15.1], sbVsBtn: [25.8, 0.8, 73.4], bbVsBtn: [19.9, 67.8, 12.3], btnVs3bet: [19.7, 37.6, 42.6] },
};

describe.each([100, 40, 20] as const)("tournament 8-max at %ibb against GTO Wizard", (stack) => {
  const want = GTO_WIZARD[stack];
  const toBtn = foldsTo("BTN");

  it("opens", () => {
    const opens = ["UTG", "LJ", "HJ", "CO", "BTN"].map((seat) => ofAll(spot(stack, foldsTo(seat)).hands)[0]);
    expectNear(opens, want.opens);
  });

  it("SB raises, limps and folds first in", () => {
    expectNear(ofAll(spot(stack, [...toBtn, "BTN:fold"]).hands), want.sb);
  });

  it("the blinds answer a button open", () => {
    expectNear(ofAll(spot(stack, [...toBtn, "BTN:raise"]).hands), want.sbVsBtn);
    expectNear(ofAll(spot(stack, [...toBtn, "BTN:raise", "SB:fold"]).hands), want.bbVsBtn);
  });

  it("the button answers a BB 3-bet, of the range that got there", () => {
    const open = spot(stack, toBtn).hands;
    const hands = spot(stack, [...toBtn, "BTN:raise", "SB:fold", "BB:raise"]).hands;
    const width = share(open, raised);
    const raise = share(hands, (h, i) => raised(h) * raised(open[i])) / width;
    const call = share(hands, (h, i) => h.call * raised(open[i])) / width;
    expectNear([100 * raise, 100 * call, 100 - 100 * (raise + call)], want.btnVs3bet);
  });
});

describe("tournament all-in re-raises", () => {
  const toBtn = foldsTo("BTN");
  const jams = (hands: HandFrequency[]) => share(hands, (h) => h.allin ?? 0) / share(hands, raised);

  it("3-bets all-in at 20bb, but not at 40bb", () => {
    expect(jams(spot(20, [...toBtn, "BTN:raise", "SB:fold"]).hands)).toBe(1);
    expect(jams(spot(40, [...toBtn, "BTN:raise", "SB:fold"]).hands)).toBe(0);
  });

  it("4-bets all-in at 40bb, but not at 100bb", () => {
    expect(jams(spot(40, [...toBtn, "BTN:raise", "SB:fold", "BB:raise"]).hands)).toBe(1);
    expect(jams(spot(100, [...toBtn, "BTN:raise", "SB:fold", "BB:raise"]).hands)).toBe(0);
  });
});
