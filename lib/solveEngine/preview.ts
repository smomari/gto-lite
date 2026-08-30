import type { ActionNode, Position } from "@/types/rangeData";
import type { AvailableActions } from "@/types/solveApi";
import { SEAT_ORDER, seatIndex } from "@/lib/actionTree/seatOrder";
import { replayActionPath } from "./replay";
import { computeAvailableActions } from "./actionSizing";

/**
 * Client-safe (no equity matrix / Node deps — only replay.ts + actionSizing.ts,
 * both pure pot-ledger math). For a not-yet-reached `target` seat, computes what
 * its real Fold/Call/Raise/Allin options would be if every seat between the
 * current `activeSeat` and `target` folded first — powers the "quick action"
 * shortcut buttons shown on pending seat boxes.
 *
 * Returns null when that isn't a reachable, still-active spot (e.g. folding
 * everyone up to `target` would already resolve the hand before `target`
 * gets a turn — the BB-uncontested-walk case).
 */
export function previewQuickAction(
  actionPath: Pick<ActionNode, "actor" | "action">[],
  activeSeat: Position,
  target: Position,
  effectiveStackBb: number,
): AvailableActions | null {
  const startIdx = seatIndex(activeSeat);
  const endIdx = seatIndex(target);
  if (endIdx <= startIdx) return null;

  const prefixFolds = SEAT_ORDER.slice(startIdx, endIdx).map((actor) => ({
    actor,
    action: "fold" as const,
  }));
  const result = replayActionPath([...actionPath, ...prefixFolds], effectiveStackBb);
  if (result.status !== "active" || result.activeSeat !== target) return null;

  return computeAvailableActions(target, result.potState, effectiveStackBb);
}
