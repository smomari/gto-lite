import { describe, expect, it } from "vitest";
import { narrowRangeAlongPath, type TreePathStep } from "./rangeNarrowing";
import type { SerializedDecisionNode } from "@/types/postflopSolver";

const terminalShowdown = { type: "terminal-showdown" as const, potBb: 10, committed: { P1: 0, P2: 0 } };

function decisionNode(actor: "P1" | "P2", strategy: number[][]): SerializedDecisionNode {
  return {
    type: "decision",
    actor,
    potBb: 10,
    currentBetToCall: 0,
    strategy,
    actions: [
      { action: "check", label: "Check", child: terminalShowdown },
      { action: "bet", label: "Bet 5.0bb", child: terminalShowdown },
    ],
  };
}

const range = [
  { cards: ["Ah", "Kd"] as [string, string], weight: 1 },
  { cards: ["7c", "2c"] as [string, string], weight: 1 },
];

describe("narrowRangeAlongPath", () => {
  it("re-weights only the acting player's combos by that node's strategy", () => {
    // P1 checks: combo 0 checks 100% of the time, combo 1 checks 25% of the time.
    const node = decisionNode("P1", [
      [1, 0],
      [0.25, 0.75],
    ]);
    const path: TreePathStep[] = [{ node, actionIndex: 0 }]; // chose "check"
    const result = narrowRangeAlongPath(range, "P1", path);
    expect(result).toEqual([
      { cards: ["Ah", "Kd"], weight: 1 },
      { cards: ["7c", "2c"], weight: 0.25 },
    ]);
  });

  it("leaves the range untouched when the actor never acts along the path", () => {
    const node = decisionNode("P2", [
      [0.5, 0.5],
      [0.5, 0.5],
    ]);
    const path: TreePathStep[] = [{ node, actionIndex: 0 }];
    expect(narrowRangeAlongPath(range, "P1", path)).toEqual(range);
  });

  it("compounds across multiple steps for the same actor", () => {
    const step1Node = decisionNode("P1", [
      [0.5, 0.5],
      [1, 0],
    ]);
    const step2Node = decisionNode("P1", [
      [0.4, 0.6],
      [1, 0],
    ]);
    const path: TreePathStep[] = [
      { node: step1Node, actionIndex: 0 }, // combo0: 0.5, combo1: 1
      { node: step2Node, actionIndex: 1 }, // combo0: 0.6, combo1: 0
    ];
    const result = narrowRangeAlongPath(range, "P1", path);
    expect(result[0].weight).toBeCloseTo(1 * 0.5 * 0.6, 10);
    expect(result[1].weight).toBeCloseTo(1 * 1 * 0, 10);
  });

  it("zeroes out a combo whose chosen action had zero probability", () => {
    const node = decisionNode("P1", [
      [1, 0],
      [0, 1],
    ]);
    const path: TreePathStep[] = [{ node, actionIndex: 0 }]; // "check"
    const result = narrowRangeAlongPath(range, "P1", path);
    expect(result[1].weight).toBe(0);
  });

  it("returns the range unchanged (aside from object identity) for an empty path", () => {
    expect(narrowRangeAlongPath(range, "P1", [])).toEqual(range);
  });
});
