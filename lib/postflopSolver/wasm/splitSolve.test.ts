// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ALL_HANDS } from "@/lib/handRange/handList";
import { expandToCombos } from "../combos";
import { LOOKAHEAD_BET_SIZING } from "../betAbstraction";
import { stratifiedNextCards } from "../nextCardSampling";
import { buildHandTree, type DecisionNode, type PostflopTreeNode } from "../treeBuilder";
import type { ComboRange } from "../types";
import { loadNodeSolverModule } from "./loadNode";
import { prepareEngineBuild, solveNativeSession } from "./engine";
import { assignLeafSlots, findLeafRoots, inProcessLeafRunner, solveSplitSession } from "./splitSolve";

const BOARD = ["Kh", "7s", "2d", "As"];

function range(from: number, to: number, step: number): ComboRange {
  return expandToCombos(
    ALL_HANDS.slice(from, to).map((h) => ({ hand: h.hand, fold: 0, call: 1, raise: 0 })),
    (hf) => hf.call,
    BOARD,
  )
    .filter((_, k) => k % step === 0)
    .map((c, k) => ({ ...c, weight: 0.4 + ((k * 7) % 5) / 8 }));
}

const hero = range(0, 30, 3);
const villain = range(10, 50, 4);
const tree = buildHandTree(10, 30, BOARD, { dealNextCards: (b) => stratifiedNextCards(b, 5), laterStreetSizing: LOOKAHEAD_BET_SIZING });
const input = { tree, board: BOARD, heroRange: hero, villainRange: villain };

/** The root street's decision nodes — the trunk, whose strategies the split solve reports. */
function trunkDecisions(node: PostflopTreeNode, out: DecisionNode[] = []): DecisionNode[] {
  if (node.type === "decision") {
    out.push(node);
    node.actions.forEach(({ child }) => trunkDecisions(child, out));
  }
  return out;
}

describe("findLeafRoots / assignLeafSlots", () => {
  it("finds one leaf per (street-ending chance node, card) and splits them across every part", () => {
    const { build } = prepareEngineBuild(input);
    const leaves = findLeafRoots(build);
    let chanceNodes = 0;
    (function walk(node: PostflopTreeNode) {
      if (node.type === "chance") chanceNodes++;
      else if (node.type === "decision") node.actions.forEach(({ child }) => walk(child));
    })(tree);
    expect(leaves).toHaveLength(chanceNodes * 5);

    const groups = assignLeafSlots(build, leaves, 3);
    expect(groups.flat().sort((a, b) => a - b)).toEqual(leaves.map((_, slot) => slot));
    for (const group of groups) expect(group.length).toBeGreaterThan(0);
  });
});

describe("solveSplitSession", () => {
  it("gives exactly the one-engine result when the leaves are spread over three engines", async () => {
    const solver = await loadNodeSolverModule();
    const options = { maxIterations: 40 };
    const whole = solveNativeSession(solver, input, options);
    const split = solveSplitSession(solver, input, options, undefined, 3, (build, leafNodes, groups) =>
      groups.map((slots) => inProcessLeafRunner(solver, build, leafNodes, slots)),
    );
    try {
      for (const node of trunkDecisions(tree)) {
        expect(split.solution.getAverageStrategy(node)).toEqual(whole.solution.getAverageStrategy(node));
      }
      const a = split.solution.finalExploitability!;
      const b = whole.solution.finalExploitability!;
      for (const key of ["bb", "p1ActualBb", "p2ActualBb", "p1BestResponseBb", "p2BestResponseBb"] as const) {
        expect(a[key]).toBeCloseTo(b[key], 6);
      }

      const splitEv = split.nextStreetEv();
      const wholeEv = whole.nextStreetEv();
      expect(splitEv.size).toBe(wholeEv.size);
      for (const [node, ev] of wholeEv) {
        expect(splitEv.get(node)!.heroEvBb).toBeCloseTo(ev.heroEvBb, 4);
        expect(splitEv.get(node)!.villainEvBb).toBeCloseTo(ev.villainEvBb, 4);
      }
    } finally {
      split.dispose();
      whole.dispose();
    }
  });

  it("stops at the exploitability target like the one-engine solve", async () => {
    const solver = await loadNodeSolverModule();
    const options = { maxIterations: 3000, targetExploitabilityPercent: 1 };
    const whole = solveNativeSession(solver, input, options);
    const split = solveSplitSession(solver, input, options, undefined, 2, (build, leafNodes, groups) =>
      groups.map((slots) => inProcessLeafRunner(solver, build, leafNodes, slots)),
    );
    try {
      expect(split.solution.iterations).toBe(whole.solution.iterations);
      expect(split.solution.finalExploitability!.percentOfPot).toBeLessThanOrEqual(1);
    } finally {
      split.dispose();
      whole.dispose();
    }
  });
});
