import { describe, expect, it } from "vitest";
import { buildRfiTree, RFI_POSITIONS } from "./rfiTree";
import type { DecisionNode } from "@/lib/postflopSolver/treeBuilder";
import { totalPot } from "@/lib/postflopSolver/potState";

describe("buildRfiTree", () => {
  it("covers all 7 opening positions", () => {
    expect(RFI_POSITIONS).toEqual(["UTG", "UTG1", "LJ", "HJ", "CO", "BTN", "SB"]);
  });

  it("UTG at 100bb: sizes match actionSizing.ts's OOP deep values (2.8 open, 8.4 3bet)", () => {
    const { tree, openSizeBb, threeBetSizeBb } = buildRfiTree("UTG", 100);
    expect(openSizeBb).toBe(2.8);
    expect(threeBetSizeBb).toBe(8.4);
    expect(tree.actions.map((a) => a.action)).toEqual(["fold", "raise"]);
    expect(tree.state.committed.P1).toBe(0);
  });

  it("BTN at 100bb: sizes match actionSizing.ts's IP deep values (2.5 open, 7.5 3bet)", () => {
    const { openSizeBb, threeBetSizeBb } = buildRfiTree("BTN", 100);
    expect(openSizeBb).toBe(2.5);
    expect(threeBetSizeBb).toBe(7.5);
  });

  it("SB's root has 0.5bb already committed (its posted small blind), unlike every other opener", () => {
    const { tree } = buildRfiTree("SB", 100);
    expect(tree.state.committed.P1).toBe(0.5);
    const { tree: utgTree } = buildRfiTree("UTG", 100);
    expect(utgTree.state.committed.P1).toBe(0);
  });

  it("BB's root commitment is always the posted big blind", () => {
    for (const seat of RFI_POSITIONS) {
      const { tree } = buildRfiTree(seat, 100);
      expect(tree.state.committed.P2).toBe(1);
    }
  });

  it("node shapes: BB-vs-open has 3 actions, opener-vs-3bet has 3 (incl. allin), BB-vs-shove has 2", () => {
    const { tree } = buildRfiTree("UTG", 100);
    const bbFacesOpen = tree.actions.find((a) => a.action === "raise")!.child as DecisionNode;
    expect(bbFacesOpen.actor).toBe("P2");
    expect(bbFacesOpen.actions.map((a) => a.action)).toEqual(["fold", "call", "raise"]);

    const openerFaces3bet = bbFacesOpen.actions.find((a) => a.action === "raise")!.child as DecisionNode;
    expect(openerFaces3bet.actor).toBe("P1");
    expect(openerFaces3bet.actions.map((a) => a.action)).toEqual(["fold", "call", "allin"]);

    const bbFacesShove = openerFaces3bet.actions.find((a) => a.action === "allin")!.child as DecisionNode;
    expect(bbFacesShove.actor).toBe("P2");
    expect(bbFacesShove.actions.map((a) => a.action)).toEqual(["fold", "call"]);
  });

  it("every terminal's total pot matches the hand-derived expected value", () => {
    const { tree } = buildRfiTree("UTG", 100);
    // Root fold: dead money (SB+ante) plus BB's already-posted blind — BB
    // wins that blind back too, not just the dead money, when UTG folds.
    const rootFold = tree.actions.find((a) => a.action === "fold")!.child;
    expect(totalPot(rootFold.state)).toBeCloseTo(1.5 + 1, 9);

    // BB folds to the open: dead money + open size + BB's already-posted blind.
    const bbFacesOpen = tree.actions.find((a) => a.action === "raise")!.child as DecisionNode;
    const bbFolds = bbFacesOpen.actions.find((a) => a.action === "fold")!.child;
    expect(totalPot(bbFolds.state)).toBeCloseTo(1.5 + 2.8 + 1, 9);

    // BB calls the open: dead money + 2x open size (goes "to the flop").
    const bbCalls = bbFacesOpen.actions.find((a) => a.action === "call")!.child;
    expect(totalPot(bbCalls.state)).toBeCloseTo(1.5 + 2.8 * 2, 9);

    // Both get it in on the 3bet-shove line: dead money + 2x effective stack.
    const openerFaces3bet = bbFacesOpen.actions.find((a) => a.action === "raise")!.child as DecisionNode;
    const shoveNode = openerFaces3bet.actions.find((a) => a.action === "allin")!.child as DecisionNode;
    const shoveCalled = shoveNode.actions.find((a) => a.action === "call")!.child;
    expect(totalPot(shoveCalled.state)).toBeCloseTo(1.5 + 100 * 2, 9);
  });
});
