import { describe, expect, it } from "vitest";
import type { ComboRange } from "./types";
import { equityTableFromEntries } from "./terminalEquity";
import { initialPostflopPotState } from "./potState";
import type { DecisionNode, PostflopTreeNode } from "./treeBuilder";
import type { CfrSolution } from "./cfr";
import { computeCheckdownEquities } from "./checkdownEquity";

function comboKey(cards: [string, string]): string {
  return [...cards].sort().join("");
}
function tableKey(a: [string, string], b: [string, string]): string {
  return `${comboKey(a)}|${comboKey(b)}`;
}

describe("computeCheckdownEquities", () => {
  it("a check-check terminal's summary matches a manual equityVsRange-style calculation", () => {
    const hero: [string, string] = ["As", "Ks"];
    const villain: [string, string] = ["Qh", "Qd"];
    const state = initialPostflopPotState(10);
    const showdown: PostflopTreeNode = { type: "terminal-showdown", state };

    const solution: CfrSolution = { iterations: 1, getAverageStrategy: () => [[1]] };
    const heroRange: ComboRange = [{ cards: hero, weight: 1 }];
    const villainRange: ComboRange = [{ cards: villain, weight: 1 }];
    const table = equityTableFromEntries(heroRange, villainRange, new Map([[tableKey(hero, villain), 0.7]]));

    const summaries = computeCheckdownEquities(showdown, solution, heroRange, villainRange, table);
    const summary = summaries.get(showdown)!;

    expect(summary.heroEquityPercent).toBeCloseTo(70, 9);
    expect(summary.villainEquityPercent).toBeCloseTo(30, 9);
    expect(summary.heroEvBb).toBeCloseTo(0.7 * 10 - 0, 9);
    expect(summary.villainEvBb).toBeCloseTo(0.3 * 10 - 0, 9);
  });

  it("terminal-fold nodes never get a summary (they never reach showdown)", () => {
    const state = initialPostflopPotState(10);
    const fold: PostflopTreeNode = { type: "terminal-fold", winner: "P1", state };
    const solution: CfrSolution = { iterations: 1, getAverageStrategy: () => [[1]] };
    const heroRange: ComboRange = [{ cards: ["As", "Ks"], weight: 1 }];
    const villainRange: ComboRange = [{ cards: ["Qh", "Qd"], weight: 1 }];

    const table = equityTableFromEntries(heroRange, villainRange, new Map());
    const summaries = computeCheckdownEquities(fold, solution, heroRange, villainRange, table);
    expect(summaries.has(fold)).toBe(false);
    expect(summaries.size).toBe(0);
  });

  it("reach correctly narrows down a branching tree — a combo that folds never contributes to the showdown terminal's average", () => {
    // P1 has two combos: nuts (always checks through per the fixed strategy)
    // and air (always folds). Only the nuts combo's equity should show up in
    // the showdown terminal's summary — air's reach is zero there.
    const nuts: [string, string] = ["As", "Ah"];
    const air: [string, string] = ["7c", "2d"];
    const villain: [string, string] = ["Kh", "Kd"];
    const state = initialPostflopPotState(10);

    const foldTerminal: PostflopTreeNode = { type: "terminal-fold", winner: "P2", state };
    const showdownTerminal: PostflopTreeNode = { type: "terminal-showdown", state };
    const root: DecisionNode = {
      type: "decision",
      actor: "P1",
      state,
      actions: [
        { action: "fold", child: foldTerminal },
        { action: "check", child: showdownTerminal },
      ],
    };

    // combo 0 (nuts) always checks (action index 1), combo 1 (air) always folds (action index 0).
    const solution: CfrSolution = {
      iterations: 1,
      getAverageStrategy: () => [
        [0, 1],
        [1, 0],
      ],
    };
    const heroRange: ComboRange = [
      { cards: nuts, weight: 1 },
      { cards: air, weight: 1 },
    ];
    const villainRange: ComboRange = [{ cards: villain, weight: 1 }];
    const table = equityTableFromEntries(
      heroRange,
      villainRange,
      new Map([
        [tableKey(nuts, villain), 0.95],
        [tableKey(air, villain), 0.05],
      ]),
    );

    const summaries = computeCheckdownEquities(root, solution, heroRange, villainRange, table);
    const summary = summaries.get(showdownTerminal)!;
    // Only nuts (95% equity) reaches the showdown terminal — air's reach is 0 there.
    expect(summary.heroEquityPercent).toBeCloseTo(95, 9);
  });

  it("does not throw when a decision node's reach is entirely zero (defensive)", () => {
    const state = initialPostflopPotState(10);
    const showdown: PostflopTreeNode = { type: "terminal-showdown", state };
    const root: DecisionNode = {
      type: "decision",
      actor: "P1",
      state,
      actions: [{ action: "check", child: showdown }],
    };
    const solution: CfrSolution = { iterations: 1, getAverageStrategy: () => [[1]] };
    // Zero-weight hero combo — reach is 0 throughout.
    const heroCards: [string, string] = ["As", "Ks"];
    const villainCards: [string, string] = ["Qh", "Qd"];
    const heroRange: ComboRange = [{ cards: heroCards, weight: 0 }];
    const villainRange: ComboRange = [{ cards: villainCards, weight: 1 }];
    const table = equityTableFromEntries(heroRange, villainRange, new Map([[tableKey(heroCards, villainCards), 0.6]]));

    expect(() => computeCheckdownEquities(root, solution, heroRange, villainRange, table)).not.toThrow();
  });
});
