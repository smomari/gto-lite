import { describe, expect, it } from "vitest";
import { NO_RAKE } from "@/lib/solveEngine/rake";
import { flattenTree, NODE_DECISION_P1, NODE_DECISION_P2, NODE_FOLD } from "./flattenTree";
import { initialPostflopPotState } from "./potState";
import type { PostflopTreeNode } from "./treeBuilder";
import { buildStreetTree } from "./treeBuilder";

const BOARD = ["Kd", "Qc", "8h", "5s", "2d"];
const tree = buildStreetTree(10, 90, "river");
const isDecision = (type: number) => type === NODE_DECISION_P1 || type === NODE_DECISION_P2;

describe("flattenTree rake", () => {
  it("leaves every pot alone with no rake", () => {
    expect(flattenTree(tree, BOARD, NO_RAKE).pot).toEqual(flattenTree(tree, BOARD).pot);
    expect(flattenTree(tree, BOARD, { rate: 0.05, capBb: 0 }).pot).toEqual(flattenTree(tree, BOARD).pot);
  });

  it("takes rake from terminal pots up to the cap, and nowhere else", () => {
    const gross = flattenTree(tree, BOARD);
    const raked = flattenTree(tree, BOARD, { rate: 0.05, capBb: 3 });
    let terminals = 0;
    let capped = 0;
    raked.pot.forEach((pot, i) => {
      if (isDecision(raked.type[i])) {
        expect(pot).toBe(gross.pot[i]);
        return;
      }
      terminals++;
      if (raked.type[i] === NODE_FOLD) return;
      expect(pot).toBeCloseTo(gross.pot[i] - Math.min(gross.pot[i] * 0.05, 3), 4);
      if (gross.pot[i] * 0.05 > 3) capped++;
    });
    expect(terminals).toBeGreaterThan(0);
    expect(capped).toBeGreaterThan(0);
  });

  it("charges a fold on the matched pot: the uncalled bet goes back untouched", () => {
    const betIntoThePot = { ...initialPostflopPotState(10), committed: { P1: 10, P2: 0 } };
    const fold: PostflopTreeNode = { type: "terminal-fold", winner: "P1", state: betIntoThePot };
    expect(flattenTree(fold, BOARD, { rate: 0.05, capBb: 3 }).pot[0]).toBeCloseTo(20 - 0.5, 5);
  });
});
