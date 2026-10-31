import type { ActionNode, HandFrequency, Position } from "@/types/rangeData";
import type { SolveResponse } from "@/types/solveApi";
import type { ActionWeightKey } from "@/types/postflopSolver";
import { postflopSeatIndex } from "@/lib/actionTree/seatOrder";

/**
 * Identity of one decision point. A seat's solved range depends only on the
 * stack and the path that led to its decision, so responses keyed this way
 * never go stale when the user undoes and replays a different branch — and a
 * seat that decides twice (open, then facing a 3-bet) keeps both ranges apart.
 */
export function actionPathKey(path: Pick<ActionNode, "actor" | "action">[]): string {
  return path.map((n) => `${n.actor}:${n.action}`).join(",");
}

export interface HandoffSeat {
  seat: Position;
  remainingBb: number;
  /** The range this seat entered the flop with — the frequencies at its last preflop decision. Null until that decision's response has arrived. */
  hands: HandFrequency[] | null;
  actionKey: ActionWeightKey;
}

export type ReadyHandoffSeat = HandoffSeat & { hands: HandFrequency[] };

export interface PostflopHandoff {
  liveSeats: HandoffSeat[];
  /** OOP first. Only set for exactly 2 live seats whose ranges have both arrived. */
  matchup: [ReadyHandoffSeat, ReadyHandoffSeat] | null;
}

function lastActionIndex(actionPath: ActionNode[], seat: Position): number {
  for (let i = actionPath.length - 1; i >= 0; i--) {
    if (actionPath[i].actor === seat) return i;
  }
  return -1;
}

/**
 * Each range engine only produces one aggressive action — Nash shoves, the
 * heuristic engine and solver export raise — but a seat can click either, so
 * read off that action's frequency alone and the range comes back empty.
 * Both clicks mean "this seat's aggressive range": an approximation of what
 * it would really do with the size it didn't produce, but a usable one.
 */
function withAggressiveRange(hands: HandFrequency[], actionKey: ActionWeightKey): HandFrequency[] {
  if (actionKey !== "raise" && actionKey !== "allin") return hands;
  return hands.map((hf) => ({ ...hf, [actionKey]: hf.raise + (hf.allin ?? 0) }));
}

export function resolvePostflopHandoff(
  actionPath: ActionNode[],
  committed: Partial<Record<Position, number>>,
  stackBb: number,
  rangeByPathKey: Record<string, SolveResponse>,
): PostflopHandoff {
  const liveSeats: HandoffSeat[] = [];

  for (const [seatKey, committedBb] of Object.entries(committed)) {
    const seat = seatKey as Position;
    const lastIdx = lastActionIndex(actionPath, seat);
    if (lastIdx !== -1 && actionPath[lastIdx].action === "fold") continue;

    const response = lastIdx === -1 ? undefined : rangeByPathKey[actionPathKey(actionPath.slice(0, lastIdx))];
    const actionKey = lastIdx === -1 ? "call" : actionPath[lastIdx].action;
    liveSeats.push({
      seat,
      remainingBb: stackBb - (committedBb ?? 0),
      hands: response?.heroPosition === seat ? withAggressiveRange(response.hands, actionKey) : null,
      actionKey,
    });
  }

  const ready = liveSeats.filter((s): s is ReadyHandoffSeat => s.hands !== null);
  const matchup =
    liveSeats.length === 2 && ready.length === 2
      ? ([...ready].sort((a, b) => postflopSeatIndex(a.seat) - postflopSeatIndex(b.seat)) as [
          ReadyHandoffSeat,
          ReadyHandoffSeat,
        ])
      : null;

  return { liveSeats, matchup };
}
