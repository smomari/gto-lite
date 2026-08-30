import { describe, expect, it } from "vitest";
import type { ComboRange } from "./types";
import { buildEquityTable } from "./terminalEquity";
import { buildStreetTree, type DecisionNode, type PostflopTreeNode } from "./treeBuilder";
import { runCfr } from "./cfr";

const BOARD = ["Kh", "7s", "2d"];

// Hero (P1/OOP): flopped trip kings vs total air.
const heroRange: ComboRange = [
  { cards: ["Ks", "Kd"], weight: 1 }, // "nuts"
  { cards: ["4c", "3h"], weight: 1 }, // "air"
];
// Villain (P2/IP): middle pair vs total air.
const villainRange: ComboRange = [
  { cards: ["7h", "6c"], weight: 1 }, // "medium"
  { cards: ["9c", "8d"], weight: 1 }, // "air"
];

const START_POT = 7.5;
// A shallow effective stack relative to the pot (SPR ~1.3) — deliberately
// picked over a much deeper one: at very deep SPR this toy 2-combo range
// finds it's *always* right to overbet-shove with everything (since fold
// equity dominates when nobody can ever have a real "medium" hand to punish
// it), which washes out the hand-strength-dependent shape this test wants to
// check. A realistic SPR is what actually produces the polarized-but-graded
// behavior real postflop spots show.
const EFFECTIVE_STACK = 10;

function findChild(node: PostflopTreeNode, action: string): PostflopTreeNode {
  if (node.type !== "decision") throw new Error("not a decision node");
  return node.actions.find((a) => a.action === action)!.child;
}

function actionSum(row: number[]): number {
  return row.reduce((s, x) => s + x, 0);
}

describe("runCfr", () => {
  const tree = buildStreetTree(START_POT, EFFECTIVE_STACK);
  const table = buildEquityTable(heroRange, villainRange, BOARD);
  const solution = runCfr(tree, heroRange, villainRange, table, 800);

  it("every combo's average strategy at every decision node sums to 1", () => {
    (function walk(node: PostflopTreeNode) {
      if (node.type !== "decision") return;
      const strat = solution.getAverageStrategy(node);
      for (const row of strat) expect(actionSum(row)).toBeCloseTo(1, 6);
      for (const { child } of node.actions) walk(child);
    })(tree);
  });

  it("root (hero's opening decision): the nuts is more aggressive (checks less) than air", () => {
    const root = tree as DecisionNode;
    const strat = solution.getAverageStrategy(root);
    const checkIdx = root.actions.map((a) => a.action).indexOf("check");
    const [nutsCheck, airCheck] = [strat[0][checkIdx], strat[1][checkIdx]];
    expect(nutsCheck).toBeLessThan(airCheck);
  });

  it("facing a bet (check -> bet line): hero's nuts calls, hero's air folds — clean and near-deterministic", () => {
    const afterCheck = findChild(tree, "check") as DecisionNode; // P2 to act
    const afterBet = findChild(afterCheck, "bet") as DecisionNode; // P1 facing a bet: fold/call
    const strat = solution.getAverageStrategy(afterBet);
    const callIdx = afterBet.actions.map((a) => a.action).indexOf("call");

    const nutsCallFreq = strat[0][callIdx];
    const airCallFreq = strat[1][callIdx];
    expect(nutsCallFreq).toBeGreaterThan(airCallFreq);
    expect(nutsCallFreq).toBeGreaterThan(0.99); // trip kings should essentially never fold here
    expect(airCallFreq).toBeLessThan(0.01); // pure air should essentially never call here
  });

  it("the average strategy stabilizes (a convergence proxy) as iteration count grows", () => {
    const shorter = runCfr(tree, heroRange, villainRange, table, 800);
    const longer = runCfr(tree, heroRange, villainRange, table, 3200);
    const shortStrat = shorter.getAverageStrategy(tree as DecisionNode);
    const longStrat = longer.getAverageStrategy(tree as DecisionNode);
    for (let c = 0; c < shortStrat.length; c++) {
      for (let a = 0; a < shortStrat[c].length; a++) {
        expect(Math.abs(shortStrat[c][a] - longStrat[c][a])).toBeLessThan(0.1);
      }
    }
  });

  it("keeps producing well-formed (finite, in-range) probabilities with more iterations", () => {
    const longer = runCfr(tree, heroRange, villainRange, table, 3200);
    const strat = longer.getAverageStrategy(tree as DecisionNode);
    for (const row of strat) {
      for (const p of row) {
        expect(Number.isFinite(p)).toBe(true);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
      expect(actionSum(row)).toBeCloseTo(1, 6);
    }
  });
});
