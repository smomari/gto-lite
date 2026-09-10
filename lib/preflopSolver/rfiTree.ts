import type { Position } from "@/types/rangeData";
import type { DecisionNode, PostflopTreeNode } from "@/lib/postflopSolver/treeBuilder";
import type { PostflopPotState } from "@/lib/postflopSolver/potState";
import { initialPotState, applyAction } from "@/lib/solveEngine/potState";
import { computeRawRaiseTo } from "@/lib/solveEngine/actionSizing";
import { SMALL_BLIND_BB, BB_ANTE_BB, BIG_BLIND_BB } from "@/lib/solveEngine/constants";

/** The 7 seats that can open a pot (BB never opens, so it's excluded). */
export const RFI_POSITIONS: Position[] = ["UTG", "UTG1", "LJ", "HJ", "CO", "BTN", "SB"];

export interface RfiTreeResult {
  tree: DecisionNode;
  openSizeBb: number;
  threeBetSizeBb: number;
}

function pfState(startPot: number, p1: number, p2: number): PostflopPotState {
  return {
    startPot,
    committed: { P1: p1, P2: p2 },
    currentBetToCall: Math.max(p1, p2),
    lastAggressor: null,
    lastActor: null,
    raiseCount: 0,
  };
}

/**
 * Builds a 2-player "opener vs BB" RFI game tree (opener = P1, BB = P2) —
 * see the Phase C-1 plan doc for the full diagram and the modeling
 * simplifications this represents (opener-vs-BB reduction instead of true
 * multiway; "call" terminals valued via all-in equity instead of simulated
 * postflop play). Sizes are pulled from the same actionSizing.ts logic the
 * live app uses, so the solved tree matches exactly what /api/solve would
 * offer at this stack depth.
 */
export function buildRfiTree(openerSeat: Position, effectiveStackBb: number): RfiTreeResult {
  const isSB = openerSeat === "SB";
  const deadMoney = isSB ? BB_ANTE_BB : SMALL_BLIND_BB + BB_ANTE_BB;
  const openerPreCommit = isSB ? SMALL_BLIND_BB : 0;

  const engineOpen = initialPotState();
  const openSizeBb = computeRawRaiseTo(openerSeat, engineOpen, effectiveStackBb);
  const engineAfterOpen = applyAction(engineOpen, openerSeat, "raise", { effectiveStackBb, raiseToBb: openSizeBb });
  const threeBetSizeBb = computeRawRaiseTo("BB", engineAfterOpen, effectiveStackBb);

  function buildBbFacesShove(): PostflopTreeNode {
    const state = pfState(deadMoney, effectiveStackBb, threeBetSizeBb);
    return {
      type: "decision",
      actor: "P2",
      state,
      actions: [
        { action: "fold", child: { type: "terminal-fold", winner: "P1", state } },
        {
          action: "call",
          child: { type: "terminal-showdown", state: pfState(deadMoney, effectiveStackBb, effectiveStackBb) },
        },
      ],
    };
  }

  function buildOpenerFacesThreeBet(): PostflopTreeNode {
    const state = pfState(deadMoney, openSizeBb, threeBetSizeBb);
    return {
      type: "decision",
      actor: "P1",
      state,
      actions: [
        { action: "fold", child: { type: "terminal-fold", winner: "P2", state } },
        {
          action: "call",
          child: { type: "terminal-showdown", state: pfState(deadMoney, threeBetSizeBb, threeBetSizeBb) },
        },
        { action: "allin", child: buildBbFacesShove() },
      ],
    };
  }

  function buildBbFacesOpen(): PostflopTreeNode {
    const state = pfState(deadMoney, openSizeBb, BIG_BLIND_BB);
    return {
      type: "decision",
      actor: "P2",
      state,
      actions: [
        { action: "fold", child: { type: "terminal-fold", winner: "P1", state } },
        { action: "call", child: { type: "terminal-showdown", state: pfState(deadMoney, openSizeBb, openSizeBb) } },
        { action: "raise", child: buildOpenerFacesThreeBet() },
      ],
    };
  }

  const rootState = pfState(deadMoney, openerPreCommit, BIG_BLIND_BB);
  const tree: DecisionNode = {
    type: "decision",
    actor: "P1",
    state: rootState,
    actions: [
      { action: "fold", child: { type: "terminal-fold", winner: "P2", state: rootState } },
      { action: "raise", child: buildBbFacesOpen() },
    ],
  };

  return { tree, openSizeBb, threeBetSizeBb };
}
