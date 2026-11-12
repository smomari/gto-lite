import { describe, expect, it } from "vitest";
import { loadEquityMatrix } from "@/lib/equity/loadEquityMatrix";
import { ALL_HANDS, TOTAL_COMBOS } from "@/lib/handRange/handList";
import { solvePushFold, type FrequencyMap } from "@/lib/nashSolver/pushFoldSolver";
import type { ActionType, HandFrequency, Position } from "@/types/rangeData";
import { TOURNAMENT_8 } from "./gameFormat";
import { CHIP_EV, ICM_PRESETS, equalStackBubbleFactor, icmById, pushFoldPayoffs, seatEquities } from "./icm";
import { NO_RAKE_SETTINGS } from "./rake";
import { replayActionPath } from "./replay";
import { solveActiveSeat } from "./solve";

const matrix = loadEquityMatrix();
const share = (range: FrequencyMap) => ALL_HANDS.reduce((sum, h) => sum + (range.get(h.hand) ?? 0) * h.combos, 0) / TOTAL_COMBOS;
const played = (hands: HandFrequency[]) => hands.reduce((sum, h, i) => sum + (1 - h.fold) * ALL_HANDS[i].combos, 0) / TOTAL_COMBOS;
const bubbleFactorOf = (id: string) => equalStackBubbleFactor(icmById(id)!, 8, 20, 20);

function solveAt(path: [Position, ActionType][], stackBb: number, icmId: string) {
  const replayed = replayActionPath(path.map(([actor, action]) => ({ actor, action })), stackBb, TOURNAMENT_8);
  if (replayed.status !== "active") throw new Error("spot should be active");
  return solveActiveSeat(matrix, replayed.activeSeat, replayed.potState, stackBb, NO_RAKE_SETTINGS, icmById(icmId)!);
}

const FOLDED_TO_BTN: [Position, ActionType][] = ["UTG", "UTG1", "LJ", "HJ", "CO"].map((seat) => [seat as Position, "fold"]);

describe("ICM presets", () => {
  it("pay only the places still left, top place first", () => {
    for (const icm of ICM_PRESETS.filter((p) => p !== CHIP_EV)) {
      expect(icm.payouts.length).toBeLessThanOrEqual(icm.playersLeft);
      for (let k = 1; k < icm.payouts.length; k++) expect(icm.payouts[k]).toBeLessThan(icm.payouts[k - 1]);
    }
    expect(icmById("bubble")!.payouts.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 10);
  });

  it("give equal stacks an equal share of what's left to pay", () => {
    const finalTable = icmById("final-table")!;
    const equities = seatEquities(finalTable, Array(8).fill(30), 30);
    const left = finalTable.payouts.reduce((s, v) => s + v, 0);
    for (const v of equities) expect(v).toBeCloseTo(left / 8, 10);
  });

  it("price busting harder the closer the stage is to the money", () => {
    expect(bubbleFactorOf("chip-ev")).toBe(1);
    expect(bubbleFactorOf("early")).toBeGreaterThan(1);
    expect(bubbleFactorOf("near-bubble")).toBeGreaterThan(bubbleFactorOf("early"));
    expect(bubbleFactorOf("bubble")).toBeGreaterThan(bubbleFactorOf("near-bubble"));
    expect(bubbleFactorOf("in-the-money")).toBeLessThan(bubbleFactorOf("bubble"));
  });
});

describe("pushFoldPayoffs", () => {
  it("leaves the shover no worse off for a steal and no better for a loss", () => {
    const { shover, caller } = pushFoldPayoffs(icmById("bubble")!, 8, 10, 10, 2.5, { shoverBb: 0.5, callerBb: 1 });
    expect(shover.steal).toBeGreaterThan(shover.fold);
    expect(shover.win).toBeGreaterThan(shover.steal);
    expect(shover.lose).toBeLessThan(shover.fold);
    expect(caller.win).toBeGreaterThan(caller.fold);
  });

  it("in chips, reproduce the chip-EV solve", () => {
    const S = 10;
    const pot = 2.5;
    // The SB has 9.5 behind and the BB 9; a called shove is 21.
    const chips = { shover: { fold: 0, steal: pot, win: 21 - 9.5, lose: -9.5 }, caller: { fold: 0, win: 21 - 9, lose: -9 } };
    const plain = solvePushFold(matrix, { effectiveStackBb: S });
    const priced = solvePushFold(matrix, { effectiveStackBb: S, payoffs: chips });
    expect(share(priced.shoveFrequency)).toBeCloseTo(share(plain.shoveFrequency), 2);
    expect(share(priced.callFrequency)).toBeCloseTo(share(plain.callFrequency), 2);
  });
});

describe("solveActiveSeat under ICM", () => {
  it("calls a shove much tighter on the bubble", () => {
    const facingShove: [Position, ActionType][] = [...FOLDED_TO_BTN, ["BTN", "fold"], ["SB", "allin"]];
    const chipEv = played(solveAt(facingShove, 10, "chip-ev").hands);
    const early = played(solveAt(facingShove, 10, "early").hands);
    const bubble = played(solveAt(facingShove, 10, "bubble").hands);
    expect(early).toBeLessThan(chipEv);
    expect(bubble).toBeLessThan(early - 0.1);
  });

  it("defends the big blind tighter on the bubble, and leaves the open alone with every stack equal", () => {
    const facingOpen: [Position, ActionType][] = [...FOLDED_TO_BTN, ["BTN", "raise"], ["SB", "fold"]];
    expect(played(solveAt(facingOpen, 40, "bubble").hands)).toBeLessThan(played(solveAt(facingOpen, 40, "chip-ev").hands) - 0.05);
    expect(solveAt(FOLDED_TO_BTN, 40, "bubble").hands).toEqual(solveAt(FOLDED_TO_BTN, 40, "chip-ev").hands);
  });

  it("prices a call harder the less of the stack stays behind it", () => {
    const facingOpen: [Position, ActionType][] = [...FOLDED_TO_BTN, ["BTN", "raise"], ["SB", "fold"]];
    const facingThreeBet: [Position, ActionType][] = [...facingOpen, ["BB", "raise"]];
    const tightening = (path: [Position, ActionType][], stackBb: number) => {
      const chipEv = played(solveAt(path, stackBb, "chip-ev").hands);
      return (chipEv - played(solveAt(path, stackBb, "bubble").hands)) / chipEv;
    };
    expect(tightening(facingOpen, 100)).toBeLessThan(tightening(facingOpen, 20));
    expect(tightening(facingThreeBet, 40)).toBeGreaterThan(tightening(facingOpen, 40));
  });
});
