// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ALL_HANDS } from "@/lib/handRange/handList";
import { expandToCombos } from "../combos";
import { LOOKAHEAD_BET_SIZING } from "../betAbstraction";
import { stratifiedNextCards } from "../nextCardSampling";
import { buildHandTree, type DecisionNode, type PostflopTreeNode } from "../treeBuilder";
import type { ComboRange } from "../types";
import { loadNodeSolverModule, loadNodeThreadedSolverModule } from "./loadNode";
import { findLeafRoots, prepareEngineBuild, solveNativeSession, solveThreadedSession } from "./engine";

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

/** The root street's decision nodes — the trunk, whose strategies the threaded solve reports. */
function trunkDecisions(node: PostflopTreeNode, out: DecisionNode[] = []): DecisionNode[] {
  if (node.type === "decision") {
    out.push(node);
    node.actions.forEach(({ child }) => trunkDecisions(child, out));
  }
  return out;
}

describe("findLeafRoots", () => {
  it("finds one leaf per (street-ending chance node, card)", () => {
    const { build } = prepareEngineBuild(input);
    let chanceNodes = 0;
    (function walk(node: PostflopTreeNode) {
      if (node.type === "chance") chanceNodes++;
      else if (node.type === "decision") node.actions.forEach(({ child }) => walk(child));
    })(tree);
    expect(findLeafRoots(build)).toHaveLength(chanceNodes * 5);
  });
});

describe("solveThreadedSession", () => {
  it.each([2, 4])("gives exactly the one-thread result on %i threads", async (threads) => {
    const options = { maxIterations: 40 };
    const whole = solveNativeSession(await loadNodeSolverModule(), input, options);
    const threaded = solveThreadedSession(await loadNodeThreadedSolverModule(4), input, options, undefined, threads);
    try {
      for (const node of trunkDecisions(tree)) {
        expect(threaded.solution.getAverageStrategy(node)).toEqual(whole.solution.getAverageStrategy(node));
      }
      const a = threaded.solution.finalExploitability!;
      const b = whole.solution.finalExploitability!;
      for (const key of ["bb", "p1ActualBb", "p2ActualBb", "p1BestResponseBb", "p2BestResponseBb"] as const) {
        expect(a[key]).toBeCloseTo(b[key], 6);
      }

      const threadedEv = threaded.nextStreetEv();
      const wholeEv = whole.nextStreetEv();
      expect(threadedEv.size).toBe(wholeEv.size);
      for (const [node, ev] of wholeEv) {
        expect(threadedEv.get(node)!.heroEvBb).toBeCloseTo(ev.heroEvBb, 4);
        expect(threadedEv.get(node)!.villainEvBb).toBeCloseTo(ev.villainEvBb, 4);
      }
    } finally {
      threaded.dispose();
      whole.dispose();
    }
  });

  it("stops at the exploitability target like the one-thread solve", async () => {
    const options = { maxIterations: 3000, targetExploitabilityPercent: 1 };
    const whole = solveNativeSession(await loadNodeSolverModule(), input, options);
    const threaded = solveThreadedSession(await loadNodeThreadedSolverModule(4), input, options, undefined, 4);
    try {
      expect(threaded.solution.iterations).toBe(whole.solution.iterations);
      expect(threaded.solution.finalExploitability!.percentOfPot).toBeLessThanOrEqual(1);
    } finally {
      threaded.dispose();
      whole.dispose();
    }
  });

  it("releases its threads, so a later solve can use them again", async () => {
    const solver = await loadNodeThreadedSolverModule(4);
    for (let round = 0; round < 3; round++) {
      solveThreadedSession(solver, input, { maxIterations: 5 }, undefined, 4).dispose();
    }
  });
});
