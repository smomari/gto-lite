import type { ActionNode, ActionType, Position } from "@/types/rangeData";
import { computeAvailableActions } from "./actionSizing";
import { initialPotState, applyAction, type PotState } from "./potState";
import { computeNextActor, type HandResolvedReason } from "./rotation";

export type { HandResolvedReason };

export type ReplayResult =
  | { status: "active"; activeSeat: Position; potState: PotState; canonicalActionPath: ActionNode[] }
  | {
      status: "resolved";
      reason: HandResolvedReason;
      potState: PotState;
      canonicalActionPath: ActionNode[];
    }
  | { status: "invalid"; reason: string };

const RAISE_DEPTH_LABEL: Record<number, string> = { 1: "open", 2: "3bet", 3: "4bet" };

function labelForRaiseDepth(depth: number): string {
  return RAISE_DEPTH_LABEL[depth] ?? `${depth + 1}bet`;
}

function canonicalLabel(action: ActionType, state: PotState, raiseDepthBefore: number): string {
  if (action === "fold") return "fold";
  if (action === "call") return "call";
  if (action === "allin" && state.raiseDepth === raiseDepthBefore) return "allin"; // all-in call, not a raise
  if (action === "allin") return "allin";
  return labelForRaiseDepth(state.raiseDepth);
}

/**
 * Replays and validates a full action sequence against the real poker
 * action-reopening state machine (rotation.ts), recomputing every raise size
 * server-side (actionSizing.ts) rather than trusting the caller's history.
 */
export function replayActionPath(
  actionPath: Pick<ActionNode, "actor" | "action">[],
  effectiveStackBb: number,
): ReplayResult {
  let state = initialPotState();
  const canonicalActionPath: ActionNode[] = [];

  for (const node of actionPath) {
    const next = computeNextActor(state);
    if (next.type === "resolved") {
      return { status: "invalid", reason: "action supplied after the hand already resolved" };
    }
    if (node.actor !== next.seat) {
      return { status: "invalid", reason: `expected ${next.seat} to act, got ${node.actor}` };
    }

    const legalActions: ActionType[] =
      state.lastAggressor === null ? ["fold", "raise", "allin"] : ["fold", "call", "raise", "allin"];
    if (!legalActions.includes(node.action)) {
      return { status: "invalid", reason: `${node.action} is illegal for ${node.actor} in this state` };
    }

    let action = node.action;
    let raiseToBb: number | undefined;
    if (action === "raise") {
      const available = computeAvailableActions(node.actor, state, effectiveStackBb);
      if (available.raise) {
        raiseToBb = available.raise.toBb;
      } else {
        // Sizing would collapse this into an all-in — normalize rather than reject,
        // avoiding a client/server desync over a purely cosmetic distinction.
        action = "allin";
      }
    }

    const raiseDepthBefore = state.raiseDepth;
    state = applyAction(state, node.actor, action, { effectiveStackBb, raiseToBb });

    canonicalActionPath.push({
      actor: node.actor,
      action,
      label: canonicalLabel(action, state, raiseDepthBefore),
      sizeBb: action === "fold" ? undefined : state.committed[node.actor],
    });
  }

  const finalNext = computeNextActor(state);
  if (finalNext.type === "resolved") {
    return { status: "resolved", reason: finalNext.reason, potState: state, canonicalActionPath };
  }
  return { status: "active", activeSeat: finalNext.seat, potState: state, canonicalActionPath };
}
