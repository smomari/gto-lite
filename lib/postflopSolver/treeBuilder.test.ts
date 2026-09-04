import { describe, expect, it } from "vitest";
import { buildStreetTree, type PostflopTreeNode } from "./treeBuilder";

function findAction(node: PostflopTreeNode, action: string): PostflopTreeNode {
  if (node.type !== "decision") throw new Error("not a decision node");
  const found = node.actions.find((a) => a.action === action);
  if (!found) throw new Error(`action ${action} not found among ${node.actions.map((a) => a.action)}`);
  return found.child;
}

function findNthAction(node: PostflopTreeNode, action: string, index: number): PostflopTreeNode {
  if (node.type !== "decision") throw new Error("not a decision node");
  const matches = node.actions.filter((a) => a.action === action);
  if (matches.length <= index) throw new Error(`action ${action}[${index}] not found`);
  return matches[index].child;
}

function actionCounts(node: PostflopTreeNode): Record<string, number> {
  if (node.type !== "decision") throw new Error("not a decision node");
  const counts: Record<string, number> = {};
  for (const { action } of node.actions) counts[action] = (counts[action] ?? 0) + 1;
  return counts;
}

function countDecisionNodes(node: PostflopTreeNode): number {
  if (node.type !== "decision") return 0;
  return 1 + node.actions.reduce((sum, a) => sum + countDecisionNodes(a.child), 0);
}

describe("buildStreetTree — flop (2 bet sizes, 1 raise size)", () => {
  it("root is P1's decision with check + 2 bets + allin, no fold (nothing to fold to yet)", () => {
    const tree = buildStreetTree(7.5, 97, "flop");
    expect(tree.type).toBe("decision");
    if (tree.type !== "decision") return;
    expect(tree.actor).toBe("P1");
    expect(actionCounts(tree)).toEqual({ check: 1, bet: 2, allin: 1 });
  });

  it("check-check closes the street at a showdown terminal", () => {
    const tree = buildStreetTree(7.5, 97, "flop");
    const afterP1Check = findAction(tree, "check");
    expect(afterP1Check.type).toBe("decision");
    const afterP2Check = findAction(afterP1Check, "check");
    expect(afterP2Check.type).toBe("terminal-showdown");
  });

  it("check-bet gives the checker fold/call/raise/allin (raiseCount 0)", () => {
    const tree = buildStreetTree(7.5, 97, "flop");
    const afterP1Check = findAction(tree, "check");
    const afterP2Bet = findNthAction(afterP1Check, "bet", 0);
    expect(afterP2Bet.type).toBe("decision");
    if (afterP2Bet.type !== "decision") return;
    expect(afterP2Bet.actor).toBe("P1");
    expect(actionCounts(afterP2Bet)).toEqual({ fold: 1, call: 1, raise: 1, allin: 1 });
    expect(findAction(afterP2Bet, "fold").type).toBe("terminal-fold");
    expect(findAction(afterP2Bet, "call").type).toBe("terminal-showdown");
  });

  it("betting immediately gives the opponent fold/call/raise/allin, then raising caps further action to fold/call", () => {
    const tree = buildStreetTree(7.5, 97, "flop");
    const afterP1Bet = findNthAction(tree, "bet", 0);
    expect(afterP1Bet.type).toBe("decision");
    if (afterP1Bet.type !== "decision") return;
    expect(afterP1Bet.actor).toBe("P2");
    expect(actionCounts(afterP1Bet)).toEqual({ fold: 1, call: 1, raise: 1, allin: 1 });

    const afterP2Raise = findAction(afterP1Bet, "raise");
    expect(afterP2Raise.type).toBe("decision");
    if (afterP2Raise.type !== "decision") return;
    expect(afterP2Raise.actor).toBe("P1");
    // Raise cap reached: only fold/call remain, both terminal.
    expect(actionCounts(afterP2Raise)).toEqual({ fold: 1, call: 1 });
    expect(findAction(afterP2Raise, "fold").type).toBe("terminal-fold");
    expect(findAction(afterP2Raise, "call").type).toBe("terminal-showdown");
  });

  it("responding to a bet with allin also caps further action to fold/call (stack exhausted)", () => {
    const tree = buildStreetTree(7.5, 97, "flop");
    const afterP1Bet = findNthAction(tree, "bet", 0);
    const afterP2Allin = findAction(afterP1Bet, "allin");
    expect(afterP2Allin.type).toBe("decision");
    if (afterP2Allin.type !== "decision") return;
    expect(actionCounts(afterP2Allin)).toEqual({ fold: 1, call: 1 });
  });

  it("responding to an opening allin (not just a bet) also caps to fold/call — no raise room left", () => {
    const tree = buildStreetTree(7.5, 97, "flop");
    const afterP1Allin = findAction(tree, "allin");
    expect(afterP1Allin.type).toBe("decision");
    if (afterP1Allin.type !== "decision") return;
    expect(actionCounts(afterP1Allin)).toEqual({ fold: 1, call: 1 });
  });

  it("a fold terminal correctly names the non-folder as winner", () => {
    const tree = buildStreetTree(7.5, 97, "flop");
    const foldNode = findNthAction(tree, "bet", 0); // -> P2 decision
    if (foldNode.type !== "decision") throw new Error("expected decision");
    const fold = foldNode.actions.find((a) => a.action === "fold")!.child;
    expect(fold).toEqual(expect.objectContaining({ type: "terminal-fold", winner: "P1" }));
  });

  it("stays small and bounded: 16 decision nodes for 2 bet sizes + 1 raise size", () => {
    const tree = buildStreetTree(7.5, 97, "flop");
    expect(countDecisionNodes(tree)).toBe(16);
  });

  it("collapses every bet size into allin-only when the stack is too short", () => {
    const tree = buildStreetTree(7.5, 1, "flop"); // tiny stack
    if (tree.type !== "decision") throw new Error("expected decision");
    expect(actionCounts(tree)).toEqual({ check: 1, allin: 1 });
  });
});

describe("buildStreetTree — turn/river (3 bet sizes, 2 raise sizes)", () => {
  it("root offers check + 3 bets + allin", () => {
    const tree = buildStreetTree(10, 97, "turn");
    if (tree.type !== "decision") throw new Error("expected decision");
    expect(actionCounts(tree)).toEqual({ check: 1, bet: 3, allin: 1 });
  });

  it("facing a bet offers fold/call/2 raises/allin, then the raise caps to fold/call", () => {
    const tree = buildStreetTree(10, 97, "river");
    const afterBet = findNthAction(tree, "bet", 0);
    if (afterBet.type !== "decision") throw new Error("expected decision");
    expect(actionCounts(afterBet)).toEqual({ fold: 1, call: 1, raise: 2, allin: 1 });

    const afterRaise = findNthAction(afterBet, "raise", 0);
    if (afterRaise.type !== "decision") throw new Error("expected decision");
    expect(actionCounts(afterRaise)).toEqual({ fold: 1, call: 1 });
  });

  it("stays bounded: 28 decision nodes for 3 bet sizes + 2 raise sizes", () => {
    const tree = buildStreetTree(10, 97, "turn");
    expect(countDecisionNodes(tree)).toBe(28);
  });
});
