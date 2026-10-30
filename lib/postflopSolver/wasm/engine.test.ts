// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ALL_HANDS } from "@/lib/handRange/handList";
import { expandToCombos } from "../combos";
import { buildHandTree, buildStreetTree, type DecisionNode, type PostflopTreeNode } from "../treeBuilder";
import { LOOKAHEAD_BET_SIZING } from "../betAbstraction";
import { stratifiedNextCards } from "../nextCardSampling";
import { createReferenceCfr } from "../reference/referenceCfr";
import type { ComboRange } from "../types";
import { loadNodeSolverModule } from "./loadNode";
import { NativeCfrEngine, runNativeCfr } from "./engine";
import { LOOKAHEAD_RIVER_CARDS, solvePostflopStreet } from "../solvePostflop";
import { serializeTree } from "../serialize";

/** A small range: the combos of a slice of hands, every `step`th one, with uneven weights. */
function smallRange(board: string[], from: number, to: number, step: number): ComboRange {
  const combos = expandToCombos(
    ALL_HANDS.slice(from, to).map((h) => ({ hand: h.hand, fold: 0, call: 1, raise: 0 })),
    (hf) => hf.call,
    board,
  );
  return combos.filter((_, k) => k % step === 0).map((c, k) => ({ ...c, weight: 0.4 + ((k * 7) % 5) / 8 }));
}

function decisionNodes(tree: PostflopTreeNode): DecisionNode[] {
  const out: DecisionNode[] = [];
  (function walk(node: PostflopTreeNode) {
    if (node.type === "decision") {
      out.push(node);
      node.actions.forEach(({ child }) => walk(child));
    } else if (node.type === "chance") {
      node.children.forEach(({ child }) => walk(child));
    }
  })(tree);
  return out;
}

/**
 * Runs the engine and the TS reference side by side. The engine works in f32,
 * and regret matching amplifies that rounding until the two trajectories drift
 * apart — on the turn+river tree, whose deep low-reach nodes are the most
 * sensitive, strategies differ 1e-5 after 3 iterations and 2e-3 after 15, while
 * EVs still agree to 1e-5. So strategies are compared early (the sharp check of
 * the update rule) and the exploitability report after more iterations.
 */
async function compareWithReference(tree: PostflopTreeNode, board: string[], hero: ComboRange, villain: ComboRange, reportIterations: number) {
  const STRATEGY_ITERATIONS = 3;
  const engine = NativeCfrEngine.create(await loadNodeSolverModule(), { tree, board, heroRange: hero, villainRange: villain });
  const reference = createReferenceCfr(tree, board, hero, villain);
  engine.iterate(1, STRATEGY_ITERATIONS);
  reference.iterate(1, STRATEGY_ITERATIONS);

  let maxStrategyDiff = 0;
  for (const node of decisionNodes(tree)) {
    const a = engine.averageStrategy(node);
    const b = reference.averageStrategy(node);
    a.forEach((row, c) => row.forEach((p, k) => (maxStrategyDiff = Math.max(maxStrategyDiff, Math.abs(p - b[c][k])))));
  }
  engine.iterate(STRATEGY_ITERATIONS + 1, reportIterations - STRATEGY_ITERATIONS);
  reference.iterate(STRATEGY_ITERATIONS + 1, reportIterations - STRATEGY_ITERATIONS);
  const got = engine.exploitability();
  const want = reference.exploitability();
  engine.dispose();
  return { maxStrategyDiff, got, want };
}

function expectReportsClose(got: ReturnType<NativeCfrEngine["exploitability"]>, want: typeof got, startPot: number) {
  for (const key of ["p1ActualBb", "p2ActualBb", "p1BestResponseBb", "p2BestResponseBb", "bb"] as const) {
    expect(Math.abs(got[key] - want[key])).toBeLessThan(startPot * 1e-4);
  }
  // Zero-sum: both players' EVs add up to the dead money in the pot.
  expect(got.p1ActualBb + got.p2ActualBb).toBeCloseTo(startPot, 3);
}

describe("C++ CFR engine vs the TypeScript reference", () => {
  it("river street (O(n) showdown evaluation)", async () => {
    const board = ["Kh", "7s", "2d", "As", "3c"];
    const tree = buildStreetTree(10, 40, "river");
    const { maxStrategyDiff, got, want } = await compareWithReference(tree, board, smallRange(board, 0, 30, 3), smallRange(board, 15, 60, 4), 20);
    expect(maxStrategyDiff).toBeLessThan(1e-4);
    expectReportsClose(got, want, 10);
  });

  it("flop street (equity-table showdowns)", async () => {
    const board = ["Kh", "7s", "2d"];
    const tree = buildStreetTree(10, 40, "flop");
    const { maxStrategyDiff, got, want } = await compareWithReference(tree, board, smallRange(board, 0, 20, 4), smallRange(board, 10, 40, 6), 20);
    expect(maxStrategyDiff).toBeLessThan(1e-4);
    expectReportsClose(got, want, 10);
  });

  it("turn + river in one tree (chance node over every river card)", async () => {
    const board = ["Kh", "7s", "2d", "As"];
    const tree = buildHandTree(10, 25, board);
    const { maxStrategyDiff, got, want } = await compareWithReference(tree, board, smallRange(board, 0, 20, 5), smallRange(board, 10, 40, 8), 15);
    expect(maxStrategyDiff).toBeLessThan(1e-4);
    expectReportsClose(got, want, 10);
  });

  it("turn + a sampled river lookahead (per-combo renormalized chance node, reduced river menu)", async () => {
    const board = ["Kh", "7s", "2d", "As"];
    const tree = buildHandTree(10, 25, board, {
      dealNextCards: (b) => stratifiedNextCards(b, 6),
      laterStreetSizing: LOOKAHEAD_BET_SIZING,
    });
    const { maxStrategyDiff, got, want } = await compareWithReference(tree, board, smallRange(board, 0, 20, 5), smallRange(board, 10, 40, 8), 20);
    expect(maxStrategyDiff).toBeLessThan(1e-4);
    for (const key of ["p1ActualBb", "p2ActualBb", "p1BestResponseBb", "p2BestResponseBb", "bb"] as const) {
      expect(Math.abs(got[key] - want[key])).toBeLessThan(10 * 1e-4);
    }
  });
});

describe("runNativeCfr", () => {
  it("stops at the exploitability target and returns every node's strategy", async () => {
    const board = ["Kh", "7s", "2d", "As", "3c"];
    const tree = buildStreetTree(10, 40, "river");
    const hero = smallRange(board, 0, 40, 2);
    const villain = smallRange(board, 10, 60, 2);
    const solution = runNativeCfr(await loadNodeSolverModule(), { tree, board, heroRange: hero, villainRange: villain }, {
      maxIterations: 5000,
      targetExploitabilityPercent: 0.5,
    });
    expect(solution.iterations).toBeLessThan(5000);
    expect(solution.finalExploitability!.percentOfPot).toBeLessThanOrEqual(0.5);
    for (const node of decisionNodes(tree)) {
      for (const row of solution.getAverageStrategy(node)) expect(row.reduce((s, p) => s + p, 0)).toBeCloseTo(1, 5);
    }
  });
});

describe("solvePostflopStreet on the C++ engine", () => {
  it("solves a flop end to end and reports the engine's exploitability", async () => {
    const solver = await loadNodeSolverModule();
    const hands = (labels: string[]) =>
      ALL_HANDS.map((h) => ({ hand: h.hand, fold: 0, call: labels.includes(h.hand) ? 1 : 0, raise: 0 }));
    const result = solvePostflopStreet(
      {
        kind: "canonical",
        board: ["Kh", "7s", "2d"],
        heroHandFrequencies: hands(["AA", "KK", "AKs", "QJs"]),
        heroActionWeight: (hf) => hf.call,
        villainHandFrequencies: hands(["77", "98s", "KQo", "A5s"]),
        villainActionWeight: (hf) => hf.call,
        startPot: 7.5,
        effectiveStackBb: 20,
        maxIterations: 3000,
        targetExploitabilityPercent: 0.5,
      },
      undefined,
      { solver },
    );
    expect(result.exploitability.percentOfPot).toBeLessThanOrEqual(0.5);
    expect(result.exploitability).toBe(result.solution.finalExploitability);
    const root = result.tree as DecisionNode;
    expect(result.solution.getAverageStrategy(root)).toHaveLength(result.heroRange.length);
  });
});

describe("turn solves on the C++ engine", () => {
  it("look ahead into a sample of rivers, keep the engine open for reading, and value each street change", async () => {
    const solver = await loadNodeSolverModule();
    const hands = (labels: string[]) =>
      ALL_HANDS.map((h) => ({ hand: h.hand, fold: 0, call: labels.includes(h.hand) ? 1 : 0, raise: 0 }));
    const startPot = 12;
    const result = solvePostflopStreet(
      {
        kind: "canonical",
        board: ["Kh", "7s", "2d", "As"],
        heroHandFrequencies: hands(["AA", "KK", "AKs", "QJs"]),
        heroActionWeight: (hf) => hf.call,
        villainHandFrequencies: hands(["77", "98s", "KQo", "A5s"]),
        villainActionWeight: (hf) => hf.call,
        startPot,
        effectiveStackBb: 30,
        maxIterations: 3000,
        targetExploitabilityPercent: 0.5,
      },
      undefined,
      { solver },
    );
    const session = result.session!;
    try {
      expect(result.exploitability.percentOfPot).toBeLessThanOrEqual(0.5);
      const nextStreetEv = session.nextStreetEv();
      expect(nextStreetEv.size).toBeGreaterThan(0);
      for (const [chance, ev] of nextStreetEv) {
        expect(chance.children).toHaveLength(LOOKAHEAD_RIVER_CARDS); // a stratified sample of the river
        // Zero-sum around the dead money, up to the sampled deal's second-order renormalization error.
        expect(Math.abs(ev.heroEvBb + ev.villainEvBb - startPot)).toBeLessThan(startPot * 0.01);
      }
      // A river street under a chance node serializes from the live engine.
      const [chance] = nextStreetEv.keys();
      const river = serializeTree(chance.children[0].child, result.solution);
      expect(river.type === "decision" || river.type === "terminal-showdown").toBe(true);
    } finally {
      session.dispose();
    }
  });
});
