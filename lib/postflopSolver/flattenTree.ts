import { FULL_DECK } from "@/lib/cards";
import { totalPot } from "./potState";
import type { DecisionNode, PostflopTreeNode } from "./treeBuilder";

/** Node type codes shared with native/solver/engine.cpp. */
export const NODE_DECISION_P1 = 0;
export const NODE_DECISION_P2 = 1;
export const NODE_FOLD = 2;
export const NODE_SHOWDOWN_TABLE = 3;
export const NODE_SHOWDOWN_RIVER = 4;
export const NODE_CHANCE = 5;
const NO_CARD = 255;

export const CARD_INDEX: Record<string, number> = Object.fromEntries(FULL_DECK.map((c, i) => [c, i]));

/**
 * A tree as the C++ engine reads it: preorder arrays (root = 0), children in
 * child slots `childStart[node] .. + childCount[node]`. Committed amounts are
 * cumulative since the root, so a terminal's payoff is `pot − committed`
 * however many streets lie above it. Showdowns reference a board by id:
 * `tableBoards[aux]` (cards still to come — valued from an equity table) or
 * `riverBoards[aux]` (five cards — valued from hand strengths).
 */
export interface FlatTree {
  nodeCount: number;
  type: Uint8Array;
  childStart: Int32Array;
  childCount: Uint8Array;
  pot: Float32Array;
  committed1: Float32Array;
  committed2: Float32Array;
  aux: Int32Array;
  children: Int32Array;
  childCard: Uint8Array;
  childWeight: Float32Array;
  decisionIndex: Map<DecisionNode, number>;
  tableBoards: string[][];
  riverBoards: string[][];
}

interface Visit {
  node: PostflopTreeNode;
  board: string[];
  /** Chips each player committed on streets above this one. */
  before1: number;
  before2: number;
}

export function flattenTree(root: PostflopTreeNode, rootBoard: string[]): FlatTree {
  const visits: Visit[] = [];
  (function collect(visit: Visit) {
    visits.push(visit);
    const { node } = visit;
    if (node.type === "decision") {
      for (const { child } of node.actions) collect({ ...visit, node: child });
    } else if (node.type === "chance") {
      const before1 = visit.before1 + node.state.committed.P1;
      const before2 = visit.before2 + node.state.committed.P2;
      for (const { card, child } of node.children) collect({ node: child, board: [...visit.board, card], before1, before2 });
    }
  })({ node: root, board: rootBoard, before1: 0, before2: 0 });

  const nodeCount = visits.length;
  const indexOf = new Map(visits.map((v, i) => [v.node, i]));
  const flat: FlatTree = {
    nodeCount,
    type: new Uint8Array(nodeCount),
    childStart: new Int32Array(nodeCount),
    childCount: new Uint8Array(nodeCount),
    pot: new Float32Array(nodeCount),
    committed1: new Float32Array(nodeCount),
    committed2: new Float32Array(nodeCount),
    aux: new Int32Array(nodeCount),
    children: new Int32Array(nodeCount - 1),
    childCard: new Uint8Array(nodeCount - 1).fill(NO_CARD),
    childWeight: new Float32Array(nodeCount - 1),
    decisionIndex: new Map(),
    tableBoards: [],
    riverBoards: [],
  };
  const boardIds = new Map<string, number>();
  const boardId = (board: string[], list: string[][]) => {
    const key = `${list === flat.riverBoards ? "river" : "table"}:${board.join("")}`;
    let id = boardIds.get(key);
    if (id === undefined) {
      id = list.length;
      list.push(board);
      boardIds.set(key, id);
    }
    return id;
  };

  let slot = 0;
  visits.forEach(({ node, board, before1, before2 }, i) => {
    flat.pot[i] = totalPot(node.state);
    flat.committed1[i] = before1 + node.state.committed.P1;
    flat.committed2[i] = before2 + node.state.committed.P2;
    flat.childStart[i] = slot;
    switch (node.type) {
      case "decision":
        flat.type[i] = node.actor === "P1" ? NODE_DECISION_P1 : NODE_DECISION_P2;
        flat.decisionIndex.set(node, i);
        flat.childCount[i] = node.actions.length;
        for (const { child } of node.actions) flat.children[slot++] = indexOf.get(child)!;
        break;
      case "chance":
        flat.type[i] = NODE_CHANCE;
        flat.childCount[i] = node.children.length;
        for (const { card, weight, child } of node.children) {
          flat.childCard[slot] = CARD_INDEX[card];
          flat.childWeight[slot] = weight;
          flat.children[slot++] = indexOf.get(child)!;
        }
        break;
      case "terminal-fold":
        flat.type[i] = NODE_FOLD;
        flat.aux[i] = node.winner === "P1" ? 0 : 1;
        break;
      case "terminal-showdown":
        if (board.length === 5) {
          flat.type[i] = NODE_SHOWDOWN_RIVER;
          flat.aux[i] = boardId(board, flat.riverBoards);
        } else {
          flat.type[i] = NODE_SHOWDOWN_TABLE;
          flat.aux[i] = boardId(board, flat.tableBoards);
        }
        break;
    }
  });
  return flat;
}
