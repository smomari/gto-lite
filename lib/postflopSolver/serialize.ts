import type { SerializedCombo, SerializedTreeNode } from "@/types/postflopSolver";
import type { CfrSolution } from "./cfr";
import { totalPot, type PostflopActionType, type PostflopPlayer, type PostflopPotState } from "./potState";
import type { PostflopTreeNode } from "./treeBuilder";
import type { ComboRange } from "./types";

function actionLabel(action: PostflopActionType, actor: PostflopPlayer, childState: PostflopPotState): string {
  const committed = childState.committed[actor];
  switch (action) {
    case "fold":
      return "Fold";
    case "check":
      return "Check";
    case "call":
      return "Call";
    case "bet":
      return `Bet ${committed.toFixed(1)}bb`;
    case "raise":
      return `Raise to ${committed.toFixed(1)}bb`;
    case "allin":
      return `Allin ${committed.toFixed(1)}bb`;
  }
}

/**
 * Converts the live solved tree (which carries a function, `CfrSolution.
 * getAverageStrategy`, and isn't structured-clone-able) into a plain,
 * postMessage-safe object with the average strategy materialized directly
 * onto each decision node.
 */
export function serializeTree(node: PostflopTreeNode, solution: CfrSolution): SerializedTreeNode {
  if (node.type === "terminal-fold") {
    return {
      type: "terminal-fold",
      potBb: totalPot(node.state),
      winner: node.winner,
      committed: { ...node.state.committed },
    };
  }
  if (node.type === "terminal-showdown") {
    return { type: "terminal-showdown", potBb: totalPot(node.state), committed: { ...node.state.committed } };
  }

  return {
    type: "decision",
    actor: node.actor,
    potBb: totalPot(node.state),
    currentBetToCall: node.state.currentBetToCall,
    strategy: solution.getAverageStrategy(node),
    actions: node.actions.map(({ action, child }) => ({
      action,
      label: actionLabel(action, node.actor, child.state),
      child: serializeTree(child, solution),
    })),
  };
}

export function serializeCombos(range: ComboRange): SerializedCombo[] {
  return range.map((c) => ({ cards: c.cards, weight: c.weight }));
}
