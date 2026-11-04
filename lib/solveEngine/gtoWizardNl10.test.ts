import { describe, expect, it } from "vitest";
import { loadEquityMatrix } from "@/lib/equity/loadEquityMatrix";
import { HAND_BY_LABEL, TOTAL_COMBOS } from "@/lib/handRange/handList";
import type { ActionType, HandFrequency, Position } from "@/types/rangeData";
import { computeAvailableActions } from "./actionSizing";
import { gameFormatById } from "./gameFormat";
import { DEFAULT_RAKE_SETTINGS } from "./rake";
import { replayActionPath } from "./replay";
import { solveActiveSeat } from "./solve";

/**
 * The cash charts are tuned to a handful of aggregate frequencies from GTO
 * Wizard's 6max NL10 100bb solution (2.5bb opens, cold calls allowed), read off
 * its screen on 2026-11-03 (the blind-against-blind spots on 2026-11-04): raise (including all-in) / call / fold, % of all
 * hands, or of the hands that reached the spot where noted. The default rake
 * preset (Online low, 5%/5bb) is NL10's. These tests keep the tuning in place.
 */
const matrix = loadEquityMatrix();
const CASH_6 = gameFormatById("cash-6")!;
const TOLERANCE = 3;

const steps = (...moves: string[]) =>
  moves.map((move) => {
    const [actor, action] = move.split(":");
    return { actor: actor as Position, action: action as ActionType };
  });

function spot(path: ReturnType<typeof steps>) {
  const result = replayActionPath(path, 100, CASH_6);
  if (result.status !== "active") throw new Error("expected a seat to act");
  return {
    hands: solveActiveSeat(matrix, result.activeSeat, result.potState, 100, DEFAULT_RAKE_SETTINGS).hands,
    raiseTo: computeAvailableActions(result.activeSeat, result.potState, 100).raise?.toBb,
  };
}

const share = (hands: HandFrequency[], weight: (h: HandFrequency, i: number) => number) =>
  (100 * hands.reduce((sum, h, i) => sum + weight(h, i) * HAND_BY_LABEL.get(h.hand)!.combos, 0)) / TOTAL_COMBOS;
const raised = (h: HandFrequency) => h.raise + (h.allin ?? 0);

/** [raise, call, fold] as % of all hands. */
function ofAll(hands: HandFrequency[]): number[] {
  return [share(hands, raised), share(hands, (h) => h.call), share(hands, (h) => h.fold)];
}

/** [raise, call, fold] as % of the hands that reached here, weighting each by how often it did. */
function ofRange(hands: HandFrequency[], before: HandFrequency[], reach: (h: HandFrequency) => number): number[] {
  const width = share(before, reach);
  const raise = share(hands, (h, i) => raised(h) * reach(before[i])) / width;
  const call = share(hands, (h, i) => h.call * reach(before[i])) / width;
  return [100 * raise, 100 * call, 100 - 100 * (raise + call)];
}

function expectNear(got: number[], want: number[]) {
  got.forEach((value, i) => expect(Math.abs(value - want[i])).toBeLessThanOrEqual(TOLERANCE));
}

const toCo = steps("LJ:fold", "HJ:fold");
const toBtn = steps("LJ:fold", "HJ:fold", "CO:fold");

describe("cash 6-max against GTO Wizard NL10", () => {
  it.each([
    ["LJ", [], 17.5],
    ["HJ", ["LJ:fold"], 21.7],
    ["CO", ["LJ:fold", "HJ:fold"], 27.9],
    ["BTN", ["LJ:fold", "HJ:fold", "CO:fold"], 40.3],
  ] as const)("%s opens", (_, path, open) => {
    expect(Math.abs(ofAll(spot(steps(...path)).hands)[0] - open)).toBeLessThanOrEqual(TOLERANCE);
  });

  it("SB raises, limps and folds first in", () => {
    const { hands, raiseTo } = spot(steps("LJ:fold", "HJ:fold", "CO:fold", "BTN:fold"));
    expectNear(ofAll(hands), [34.0, 14.9, 51.1]);
    expect(raiseTo).toBe(3.5);
  });

  it.each([
    ["SB vs a button open", [...toBtn, ...steps("BTN:raise")], [13.6, 2.7, 83.7], 11],
    ["BB vs a button open", [...toBtn, ...steps("BTN:raise", "SB:fold")], [13.0, 26.3, 60.7], 13.5],
    ["button vs a cutoff open", [...toCo, ...steps("CO:raise")], [11.3, 2.4, 86.4], 8],
    ["SB vs a cutoff open and button call", [...toCo, ...steps("CO:raise", "BTN:call")], [9.4, 2.1, 88.5], 14],
    ["BB vs a cutoff open and button call", [...toCo, ...steps("CO:raise", "BTN:call", "SB:fold")], [9.7, 8.4, 81.8], 14],
    ["BB vs a button open and SB call", [...toBtn, ...steps("BTN:raise", "SB:call")], [13.0, 20.2, 66.8], 14],
    ["BB vs an SB open", [...toBtn, ...steps("BTN:fold", "SB:raise")], [17.3, 25.5, 57.3], 10.5],
  ])("%s", (_, path, want, raiseTo) => {
    const result = spot(path);
    expectNear(ofAll(result.hands), want);
    expect(result.raiseTo).toBe(raiseTo);
  });

  it.each([
    ["button vs a BB 3-bet", [...toBtn, ...steps("BTN:raise", "SB:fold", "BB:raise")], toBtn, (h: HandFrequency) => h.raise, [15.2, 13.8, 71.0]],
    [
      "cutoff vs a BB squeeze, button still in",
      [...toCo, ...steps("CO:raise", "BTN:call", "SB:fold", "BB:raise")],
      toCo,
      (h: HandFrequency) => h.raise,
      [17.3, 3.7, 78.9],
    ],
    [
      "button vs a BB squeeze, cutoff folded",
      [...toCo, ...steps("CO:raise", "BTN:call", "SB:fold", "BB:raise", "CO:fold")],
      [...toCo, ...steps("CO:raise")],
      (h: HandFrequency) => h.call,
      [3.5, 23.7, 72.8],
    ],
    ["button vs an SB 3-bet", [...toBtn, ...steps("BTN:raise", "SB:raise", "BB:fold")], toBtn, (h: HandFrequency) => h.raise, [16.3, 12.9, 70.8]],
    ["SB vs a BB 3-bet", [...toBtn, ...steps("BTN:fold", "SB:raise", "BB:raise")], [...toBtn, ...steps("BTN:fold")], (h: HandFrequency) => h.raise, [25.9, 9.4, 64.7]],
  ])("%s, of the range that got there", (_, path, before, reach, want) => {
    expectNear(ofRange(spot(path).hands, spot(before).hands, reach), want);
  });
});
