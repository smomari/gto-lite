import type { ActionNode, Position } from "@/types/rangeData";
import type { AvailableActions } from "@/types/solveApi";
import { SEAT_ORDER } from "@/lib/actionTree/seatOrder";
import { nextLiveSeatAfter } from "./rotation";
import { replayActionPath } from "./replay";
import { computeAvailableActions } from "./actionSizing";

/**
 * Ordered seats still owing a decision in the CURRENT betting round, starting
 * with `activeSeat` itself (index 0) and continuing in table order — wrapping
 * past BB back to UTG — until it would either loop back to `activeSeat` or
 * reach `lastAggressor` (who doesn't owe another decision this round unless
 * someone reopens past them). Generalizes round 1 (`lastAggressor === null`,
 * walks the whole table) and any later reopened round identically, using the
 * same `nextLiveSeatAfter` primitive the real rotation engine uses server-side.
 *
 * Returns [] when replaying `actionPath` doesn't land on `activeSeat` as the
 * next actor (stale/mismatched pair).
 */
export function computeRoundActingOrder(
  actionPath: Pick<ActionNode, "actor" | "action">[],
  activeSeat: Position,
  effectiveStackBb: number,
): Position[] {
  const result = replayActionPath(actionPath, effectiveStackBb);
  if (result.status !== "active" || result.activeSeat !== activeSeat) return [];
  const { foldedSeats, lastAggressor } = result.potState;

  const order: Position[] = [activeSeat];
  let cursor: Position = activeSeat;
  for (let step = 0; step < SEAT_ORDER.length; step++) {
    const next = nextLiveSeatAfter(cursor, foldedSeats);
    if (next === activeSeat || next === lastAggressor) break;
    order.push(next);
    cursor = next;
  }
  return order;
}

/**
 * Client-safe (no equity matrix / Node deps — only replay.ts + actionSizing.ts,
 * both pure pot-ledger math). For a not-yet-reached `target` seat, computes what
 * its real Fold/Call/Raise/Allin options would be if every seat from
 * `activeSeat` up to (not including) `target` folded first — powers the
 * "quick action" shortcut buttons shown on pending seat boxes.
 *
 * Returns null when `target` isn't strictly after `activeSeat` in the current
 * round's acting order, or when folding up to it would already resolve the
 * hand first (e.g. the BB-uncontested-walk case).
 */
export function previewQuickAction(
  actionPath: Pick<ActionNode, "actor" | "action">[],
  activeSeat: Position,
  target: Position,
  effectiveStackBb: number,
): AvailableActions | null {
  const order = computeRoundActingOrder(actionPath, activeSeat, effectiveStackBb);
  const targetIdx = order.indexOf(target);
  if (targetIdx <= 0) return null;

  const prefixFolds = order.slice(0, targetIdx).map((actor) => ({
    actor,
    action: "fold" as const,
  }));
  const result = replayActionPath([...actionPath, ...prefixFolds], effectiveStackBb);
  if (result.status !== "active" || result.activeSeat !== target) return null;

  return computeAvailableActions(target, result.potState, effectiveStackBb);
}
