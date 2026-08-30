import { describe, expect, it } from "vitest";
import { buildStreetTree, type PostflopTreeNode } from "./treeBuilder";

function findAction(node: PostflopTreeNode, action: string): PostflopTreeNode {
  if (node.type !== "decision") throw new Error("not a decision node");
  const found = node.actions.find((a) => a.action === action);
  if (!found) throw new Error(`action ${action} not found among ${node.actions.map((a) => a.action)}`);
  return found.child;
}

function countDecisionNodes(node: PostflopTreeNode): number {
  if (node.type !== "decision") return 0;
  return 1 + node.actions.reduce((sum, a) => sum + countDecisionNodes(a.child), 0);
}

describe("buildStreetTree", () => {
  it("root is P1's decision with check/bet/allin but no fold (nothing to fold to yet)", () => {
    const tree = buildStreetTree(7.5, 97);
    expect(tree.type).toBe("decision");
    if (tree.type !== "decision") return;
    expect(tree.actor).toBe("P1");
    const actionNames = tree.actions.map((a) => a.action).sort();
    expect(actionNames).toEqual(["allin", "bet", "check"]);
  });

  it("check-check closes the street at a showdown terminal", () => {
    const tree = buildStreetTree(7.5, 97);
    const afterP1Check = findAction(tree, "check");
    expect(afterP1Check.type).toBe("decision");
    const afterP2Check = findAction(afterP1Check, "check");
    expect(afterP2Check.type).toBe("terminal-showdown");
  });

  it("check-bet gives the checker only fold/call, both terminal", () => {
    const tree = buildStreetTree(7.5, 97);
    const afterP1Check = findAction(tree, "check");
    const afterP2Bet = findAction(afterP1Check, "bet");
    expect(afterP2Bet.type).toBe("decision");
    if (afterP2Bet.type !== "decision") return;
    expect(afterP2Bet.actor).toBe("P1");
    expect(afterP2Bet.actions.map((a) => a.action).sort()).toEqual(["call", "fold"]);
    expect(findAction(afterP2Bet, "fold").type).toBe("terminal-fold");
    expect(findAction(afterP2Bet, "call").type).toBe("terminal-showdown");
  });

  it("betting immediately gives the opponent only fold/call", () => {
    const tree = buildStreetTree(7.5, 97);
    const afterP1Bet = findAction(tree, "bet");
    expect(afterP1Bet.type).toBe("decision");
    if (afterP1Bet.type !== "decision") return;
    expect(afterP1Bet.actor).toBe("P2");
    expect(afterP1Bet.actions.map((a) => a.action).sort()).toEqual(["call", "fold"]);
  });

  it("a fold terminal correctly names the non-folder as winner", () => {
    const tree = buildStreetTree(7.5, 97);
    const foldNode = findAction(tree, "bet"); // -> P2 decision
    if (foldNode.type !== "decision") throw new Error("expected decision");
    const fold = foldNode.actions.find((a) => a.action === "fold")!.child;
    expect(fold).toEqual(expect.objectContaining({ type: "terminal-fold", winner: "P1" }));
  });

  it("stays small and bounded (Phase 1's whole point: at most one aggressive action per street)", () => {
    // root + (check -> P2's decision -> {bet,allin} each opening a small
    // fold/call-only decision for P1) + (P1's own bet/allin each opening a
    // fold/call-only decision for P2) = 6 decision nodes, never more.
    const tree = buildStreetTree(7.5, 97);
    expect(countDecisionNodes(tree)).toBeLessThanOrEqual(6);
  });

  it("collapses bet into allin-only when the stack is too short for a 66% pot bet", () => {
    const tree = buildStreetTree(7.5, 2); // tiny stack
    if (tree.type !== "decision") throw new Error("expected decision");
    expect(tree.actions.map((a) => a.action).sort()).toEqual(["allin", "check"]);
  });
});
