import { computePostflopAvailableActions } from "./betAbstraction";
import {
  applyPostflopAction,
  initialPostflopPotState,
  otherPlayer,
  type PostflopActionType,
  type PostflopPlayer,
  type PostflopPotState,
} from "./potState";

export interface DecisionNode {
  type: "decision";
  actor: PostflopPlayer;
  state: PostflopPotState;
  actions: { action: PostflopActionType; child: PostflopTreeNode }[];
}

export interface TerminalFoldNode {
  type: "terminal-fold";
  winner: PostflopPlayer;
  state: PostflopPotState;
}

export interface TerminalShowdownNode {
  type: "terminal-showdown";
  state: PostflopPotState;
}

export type PostflopTreeNode = DecisionNode | TerminalFoldNode | TerminalShowdownNode;

/**
 * Builds the full decision tree for one street under Phase 1's bet
 * abstraction (betAbstraction.ts): at most one aggressive action (bet or
 * allin) total, so the tree is small and fully enumerable up front rather
 * than needing lazy/streaming construction.
 */
export function buildStreetTree(startPot: number, effectiveStackBb: number): PostflopTreeNode {
  return buildFrom(initialPostflopPotState(startPot), "P1", effectiveStackBb);
}

function buildFrom(
  state: PostflopPotState,
  actor: PostflopPlayer,
  effectiveStackBb: number,
): PostflopTreeNode {
  const available = computePostflopAvailableActions(state, actor, effectiveStackBb);
  const actions: DecisionNode["actions"] = [];

  if (available.fold) {
    const next = applyPostflopAction(state, actor, "fold", { effectiveStackBb });
    actions.push({ action: "fold", child: { type: "terminal-fold", winner: otherPlayer(actor), state: next } });
  }

  if (available.check) {
    const next = applyPostflopAction(state, actor, "check", { effectiveStackBb });
    // The street's first-ever action never closes it (the other player hasn't
    // acted yet); a check *responding* to the other player's own check does.
    const closesStreet = state.lastActor !== null;
    const child: PostflopTreeNode = closesStreet
      ? { type: "terminal-showdown", state: next }
      : buildFrom(next, otherPlayer(actor), effectiveStackBb);
    actions.push({ action: "check", child });
  }

  if (available.call) {
    // Calling always closes the street under this abstraction — there is no
    // action left to take once the single allowed bet has been matched.
    const next = applyPostflopAction(state, actor, "call", { effectiveStackBb });
    actions.push({ action: "call", child: { type: "terminal-showdown", state: next } });
  }

  if (available.bet) {
    const next = applyPostflopAction(state, actor, "bet", { effectiveStackBb, betToBb: available.bet.toBb });
    actions.push({ action: "bet", child: buildFrom(next, otherPlayer(actor), effectiveStackBb) });
  }

  if (available.allin) {
    const next = applyPostflopAction(state, actor, "allin", { effectiveStackBb });
    actions.push({ action: "allin", child: buildFrom(next, otherPlayer(actor), effectiveStackBb) });
  }

  return { type: "decision", actor, state, actions };
}
