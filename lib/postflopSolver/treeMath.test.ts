import { describe, expect, it } from "vitest";
import { initialPostflopPotState, type PostflopPotState } from "./potState";
import { equityTableFromEntries } from "./equityTableTestUtils";
import type { ComboRange } from "./types";
import { narrowReach, rangeAverageActionProbs, terminalUtilities, weightedAverage } from "./treeMath";

function stateWith(committed: { P1: number; P2: number }): PostflopPotState {
  return { ...initialPostflopPotState(10), committed, currentBetToCall: Math.max(committed.P1, committed.P2) };
}

describe("weightedAverage", () => {
  it("weights each value and returns 0 for zero total weight", () => {
    expect(weightedAverage([1, 3], [1, 3])).toBe(2.5);
    expect(weightedAverage([1, 3], [0, 0])).toBe(0);
  });
});

describe("terminalUtilities", () => {
  it("terminal-fold: the winner nets pot minus own commitment, the loser loses only their commitment", () => {
    const node = { type: "terminal-fold" as const, winner: "P1" as const, state: stateWith({ P1: 5, P2: 0 }) };
    expect(terminalUtilities(node, "P1", 2, [1], equityTableFromEntries([], [], new Map()))).toEqual([10, 10]);
    expect(terminalUtilities(node, "P2", 1, [1], equityTableFromEntries([], [], new Map()))).toEqual([-0]);
  });

  it("terminal-showdown: each combo's equity vs the opponent's reach times the pot, minus own commitment", () => {
    const hero: ComboRange = [{ cards: ["As", "Ks"], weight: 1 }];
    const villain: ComboRange = [
      { cards: ["7c", "2d"], weight: 1 },
      { cards: ["Qh", "Jh"], weight: 1 },
    ];
    const table = equityTableFromEntries(
      hero,
      villain,
      new Map([
        ["AsKs|2d7c", 0.8],
        ["AsKs|JhQh", 0.6],
      ]),
    );
    const node = { type: "terminal-showdown" as const, state: stateWith({ P1: 5, P2: 5 }) };
    // pot 20; reach weights the second villain combo 3x → equity (0.8 + 3*0.6)/4 = 0.65.
    expect(terminalUtilities(node, "P1", 1, [1, 3], table)[0]).toBeCloseTo(0.65 * 20 - 5, 10);
  });
});

describe("narrowReach", () => {
  it("multiplies each combo's reach by its probability of the taken action", () => {
    expect(narrowReach([1, 0.5], [[0.25, 0.75], [1, 0]], 1)).toEqual([0.75, 0]);
  });
});

describe("rangeAverageActionProbs", () => {
  it("averages per-combo strategies by reach", () => {
    expect(rangeAverageActionProbs([1, 3], [[1, 0], [0, 1]], 2)).toEqual([0.25, 0.75]);
  });

  it("falls back to uniform when the actor has no reach", () => {
    expect(rangeAverageActionProbs([0, 0], [[1, 0], [0, 1]], 2)).toEqual([0.5, 0.5]);
  });
});
