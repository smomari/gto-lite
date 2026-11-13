// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ALL_HANDS } from "@/lib/handRange/handList";
import type { HandFrequency } from "@/types/rangeData";
import { FLOP_BET_CANDIDATES } from "./flopSizing";
import { solvePostflopStreet } from "./solvePostflop";
import type { DecisionNode } from "./treeBuilder";
import { computeCheckdownEquities } from "./checkdownEquity";
import { loadNodeSolverModule } from "./wasm/loadNode";

/** A narrow, small HandFrequency[] so the resulting ComboRange stays tiny and the test stays fast. */
function narrowHands(includedHands: string[]): HandFrequency[] {
  const included = new Set(includedHands);
  return ALL_HANDS.map((h) => ({
    hand: h.hand,
    fold: included.has(h.hand) ? 0 : 1,
    call: included.has(h.hand) ? 1 : 0,
    raise: 0,
  }));
}

describe("solvePostflopStreet", () => {
  it("runs end-to-end from preflop-shaped HandFrequency[] to a solved tree", async () => {
    const board = ["Kh", "7s", "2d"];
    const result = solvePostflopStreet({
      kind: "canonical",
      board,
      heroHandFrequencies: narrowHands(["KK", "AA"]), // 12 combos before board removal
      heroActionWeight: (hf) => hf.call,
      villainHandFrequencies: narrowHands(["77", "98s"]), // 10 combos before board removal
      villainActionWeight: (hf) => hf.call,
      startPot: 7.5,
      effectiveStackBb: 10,
      maxIterations: 200,
    }, { solver: await loadNodeSolverModule() });

    expect(result.heroRange.length).toBeGreaterThan(0);
    expect(result.villainRange.length).toBeGreaterThan(0);
    // A specific suit appears in 3 of a pair's 6 combos (paired with each of
    // the other 3 suits) — KK loses 3 combos to the board's Kh, 77 loses 3 to 7s.
    expect(result.heroRange.length).toBe(3 + 6); // KK(3 left) + AA(6, unblocked)
    expect(result.villainRange.length).toBe(3 + 4); // 77(3 left) + 98s(4, unblocked)

    const root = result.tree as DecisionNode;
    const strategy = result.solution.getAverageStrategy(root);
    expect(strategy).toHaveLength(result.heroRange.length);
    for (const row of strategy) {
      expect(row.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 6);
    }

    // equityTable is populated and reusable by checkdownEquity.ts without
    // any further equity computation — full end-to-end pipeline check.
    expect(result.equityTable.heroCount * result.equityTable.villainCount).toBeGreaterThan(0);
    const checkdown = computeCheckdownEquities(
      result.tree,
      result.solution,
      result.heroRange,
      result.villainRange,
      result.equityTable,
    );
    // Lines the solved strategies never take have no reach on one side, so no equity to split.
    const reached = [...checkdown.values()].filter((s) => s.heroEquityPercent > 0 && s.villainEquityPercent > 0);
    expect(reached.length).toBeGreaterThan(0);
    for (const summary of reached) {
      expect(summary.heroEquityPercent + summary.villainEquityPercent).toBeCloseTo(100, 3);
    }
    result.session?.dispose();
  });

  it("throws if a range is empty after board removal", async () => {
    const board = ["Kh", "7s", "2d"];
    const solver = await loadNodeSolverModule();
    expect(() =>
      solvePostflopStreet({
        kind: "canonical",
        board,
        heroHandFrequencies: narrowHands([]), // nobody weighted -> empty range
        heroActionWeight: (hf) => hf.call,
        villainHandFrequencies: narrowHands(["77"]),
        villainActionWeight: (hf) => hf.call,
        startPot: 7.5,
        effectiveStackBb: 10,
        maxIterations: 50,
      }, { solver }),
    ).toThrow();
  });

  it("kind: combos — solves from an already-computed combo range, re-filtering for a newly-dealt card", async () => {
    const board = ["Kh", "7s", "2d", "9c"]; // turn board: 3 flop cards + 1 new turn card
    const result = solvePostflopStreet({
      kind: "combos",
      board,
      heroRange: [
        { cards: ["Ks", "Kd"], weight: 1 },
        { cards: ["9s", "9h"], weight: 1 }, // blocked by the turn's 9c? no — different suits, stays
        { cards: ["9c", "8d"], weight: 1 }, // blocked by the turn card itself
      ],
      villainRange: [
        { cards: ["7h", "6c"], weight: 1 },
        { cards: ["Ah", "Ad"], weight: 1 },
      ],
      startPot: 12.4,
      effectiveStackBb: 20,
      maxIterations: 100,
    }, { solver: await loadNodeSolverModule() });

    expect(result.heroRange).toEqual([
      { cards: ["Ks", "Kd"], weight: 1 },
      { cards: ["9s", "9h"], weight: 1 },
    ]);
    expect(result.villainRange).toHaveLength(2);
    result.session?.dispose();
  });

  const RIVER = ["Kh", "7s", "2d", "9c", "4h"];
  const riverInput = {
    kind: "combos" as const,
    board: RIVER,
    startPot: 10,
    effectiveStackBb: 90,
    maxIterations: 50,
  };

  it("drops combos that can't reach this street, keeping results aligned with what was solved", async () => {
    const result = solvePostflopStreet(
      {
        ...riverInput,
        heroRange: [
          { cards: ["Ah", "Ad"], weight: 1 },
          { cards: ["Qh", "Qd"], weight: 0 },
        ],
        villainRange: [{ cards: ["Jc", "Jd"], weight: 1 }],
      },
      { solver: await loadNodeSolverModule() },
    );
    expect(result.heroRange).toEqual([{ cards: ["Ah", "Ad"], weight: 1 }]);
    expect(result.solution.getAverageStrategy(result.tree as DecisionNode)).toHaveLength(1);
  });

  it("refuses a line neither hand of a player reaches, rather than solving it as a uniform strategy", async () => {
    const solver = await loadNodeSolverModule();
    const heroRange = [{ cards: ["Ah", "Ad"] as [string, string], weight: 0 }];
    const villainRange = [{ cards: ["Jc", "Jd"] as [string, string], weight: 1 }];
    expect(() => solvePostflopStreet({ ...riverInput, heroRange, villainRange }, { solver })).toThrow("never reached");
  });

  it("refuses ranges whose hands all block each other", async () => {
    const solver = await loadNodeSolverModule();
    const heroRange = [{ cards: ["Ah", "Ad"] as [string, string], weight: 1 }];
    const villainRange = [{ cards: ["Ad", "Qc"] as [string, string], weight: 1 }];
    expect(() => solvePostflopStreet({ ...riverInput, heroRange, villainRange }, { solver })).toThrow("never reached");
  });

  it("goes straight to a showdown when both players are already all-in", async () => {
    const result = solvePostflopStreet(
      {
        kind: "canonical",
        board: ["Kh", "7s", "2d"],
        heroHandFrequencies: narrowHands(["AA"]),
        heroActionWeight: (hf) => hf.call,
        villainHandFrequencies: narrowHands(["QQ"]),
        villainActionWeight: (hf) => hf.call,
        startPot: 200,
        effectiveStackBb: 0,
        maxIterations: 10,
      },
      { solver: await loadNodeSolverModule() },
    );
    expect(result.tree.type).toBe("terminal-showdown");
  });
});

describe("solvePostflopStreet — a flop's bet sizes", () => {
  const flop = (effectiveStackBb: number) => ({
    kind: "canonical" as const,
    board: ["Kh", "7s", "2d"],
    heroHandFrequencies: narrowHands(["KK", "AA", "QQ", "JTs", "65s"]),
    heroActionWeight: (hf: HandFrequency) => hf.call,
    villainHandFrequencies: narrowHands(["77", "98s", "AKs", "QJs", "44"]),
    villainActionWeight: (hf: HandFrequency) => hf.call,
    startPot: 10,
    effectiveStackBb,
    maxIterations: 100,
  });
  const betFractions = (node: DecisionNode) =>
    node.actions.filter((a) => a.action === "bet").map((a) => Number((a.child.state.committed[node.actor] / 10).toFixed(2)));

  it("opens with at most two of the candidate sizes for each player, after a pass that picks them", async () => {
    const phases: string[] = [];
    const result = solvePostflopStreet(flop(100), { solver: await loadNodeSolverModule() }, (phase) => {
      if (phases.at(-1) !== phase) phases.push(phase);
    });
    expect(phases).toEqual(["equity", "sizes", "cfr"]);

    const root = result.tree as DecisionNode;
    const afterCheck = root.actions[0].child as DecisionNode;
    for (const node of [root, afterCheck]) {
      const sizes = betFractions(node);
      expect(sizes.length).toBeGreaterThanOrEqual(1);
      expect(sizes.length).toBeLessThanOrEqual(2);
      for (const size of sizes) expect(FLOP_BET_CANDIDATES).toContain(size);
      // 10 pots deep: no opening all-in.
      expect(node.actions.some((a) => a.action === "allin")).toBe(false);
    }
    // Facing a bet, the pot raise and the all-in are still there.
    const facing = afterCheck.actions.find((a) => a.action === "bet")!.child as DecisionNode;
    expect(facing.actions.map((a) => a.action)).toEqual(["fold", "call", "raise", "allin"]);
    result.session?.dispose();
  });

  it("adds the opening all-in on a stack of three pots or less", async () => {
    const result = solvePostflopStreet(flop(25), { solver: await loadNodeSolverModule() });
    const root = result.tree as DecisionNode;
    expect(root.actions.at(-1)!.action).toBe("allin");
    expect((root.actions[0].child as DecisionNode).actions.at(-1)!.action).toBe("allin");
    result.session?.dispose();
  });

  it("leaves the turn's menu alone", async () => {
    const phases = new Set<string>();
    const result = solvePostflopStreet(
      { ...flop(100), board: ["Kh", "7s", "2d", "9c"] },
      { solver: await loadNodeSolverModule() },
      (phase) => phases.add(phase),
    );
    expect(phases.has("sizes")).toBe(false);
    expect(betFractions(result.tree as DecisionNode)).toEqual([0.33, 0.66, 1]);
    result.session?.dispose();
  });
});
