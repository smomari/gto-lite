import type { Position } from "@/types/rangeData";
import { SEAT_ORDER, seatIndex } from "@/lib/actionTree/seatOrder";
import type { PotState } from "./potState";

export type HandResolvedReason = "uncontested" | "action-closed";

export type NextActorResult =
  | { type: "active"; seat: Position }
  | { type: "resolved"; reason: HandResolvedReason };

/** Next live (non-folded) seat after `pos` in table order, wrapping past BB back to UTG. */
export function nextLiveSeatAfter(pos: Position | null, foldedSeats: Set<Position>): Position {
  const startIdx = pos === null ? 0 : (seatIndex(pos) + 1) % SEAT_ORDER.length;
  for (let step = 0; step < SEAT_ORDER.length; step++) {
    const candidate = SEAT_ORDER[(startIdx + step) % SEAT_ORDER.length];
    if (!foldedSeats.has(candidate)) return candidate;
  }
  throw new Error("nextLiveSeatAfter: no live seats remain");
}

/**
 * Determines whose turn is next, or whether the hand has resolved.
 *
 * Two terminal reasons only: "uncontested" fires the instant exactly one live
 * seat remains — this single condition covers both "everyone folded to BB
 * with no raise ever" and "everyone folded to the last raiser after a raise,"
 * since both are structurally identical (live-seat count dropped to 1). No
 * BB-specific special case is needed; it falls out of the general rule.
 * "action-closed" fires when the rotation returns to `lastAggressor` without
 * a new raise having reopened it (2+ live seats remain, but there's nothing
 * left for this preflop-only tool to solve).
 */
export function computeNextActor(state: PotState): NextActorResult {
  const liveSeats = SEAT_ORDER.filter((s) => !state.foldedSeats.has(s));
  if (liveSeats.length === 1) return { type: "resolved", reason: "uncontested" };

  const candidate = nextLiveSeatAfter(state.lastActor, state.foldedSeats);
  if (state.lastAggressor !== null && candidate === state.lastAggressor) {
    return { type: "resolved", reason: "action-closed" };
  }
  return { type: "active", seat: candidate };
}
