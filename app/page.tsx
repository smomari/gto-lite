"use client";

import { useEffect, useState } from "react";
import { StackSizeControl } from "@/components/TableBar/StackSizeControl";
import { SeatActionBar } from "@/components/TableBar/SeatActionBar";
import { ActionSummaryTiles } from "@/components/ActionSummaryTiles";
import { SourceBadge } from "@/components/SourceBadge";
import { RangeGrid } from "@/components/RangeGrid/RangeGrid";
import { solveNode, SolveApiError } from "@/lib/apiClient/solveClient";
import { postflopSeatIndex } from "@/lib/actionTree/seatOrder";
import { computeRoundActingOrder } from "@/lib/solveEngine/preview";
import { PostflopPanel } from "@/components/PostflopBoard/PostflopPanel";
import { PostflopBoardStrip, type StreetBoardSummary } from "@/components/TableBar/PostflopBoardStrip";
import type { ActionNode, ActionType, Position } from "@/types/rangeData";
import type { SolveResponse } from "@/types/solveApi";
import type { ActionWeightKey } from "@/types/postflopSolver";

interface RequestStep {
  actor: Position;
  action: ActionType;
}

type Result =
  | { key: string; kind: "success"; data: SolveResponse }
  | {
      key: string;
      kind: "resolved";
      reason: string;
      actionPath: ActionNode[];
      potBb: number;
      committed: Partial<Record<Position, number>>;
    }
  | { key: string; kind: "error"; message: string };

export default function Home() {
  const [stackBb, setStackBb] = useState(100);
  const [requestPath, setRequestPath] = useState<RequestStep[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  // Each live seat's own decision-point response, captured as the walk-through
  // reaches them — this *is* "their range entering the flop" once the hand
  // resolves (combined with which action they actually took, from the
  // resolved actionPath). Reset on anything that can invalidate history
  // (stack change, undo) so it never holds stale data from a discarded branch.
  const [seatResponses, setSeatResponses] = useState<Partial<Record<Position, SolveResponse>>>({});
  const [postflopBoardSummary, setPostflopBoardSummary] = useState<StreetBoardSummary[]>([]);

  const requestKey = JSON.stringify({ stackBb, requestPath });
  const loading = result === null || result.key !== requestKey;

  useEffect(() => {
    const controller = new AbortController();

    solveNode({ effectiveStackBb: stackBb, actionPath: requestPath }, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setResult({ key: requestKey, kind: "success", data });
        setSeatResponses((prev) => ({ ...prev, [data.heroPosition]: data }));
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err instanceof SolveApiError && err.code === "HAND_RESOLVED") {
          setResult({
            key: requestKey,
            kind: "resolved",
            reason: err.reason ?? "resolved",
            actionPath: err.actionPath ?? [],
            potBb: err.potBb ?? 0,
            committed: err.committed ?? {},
          });
        } else {
          setResult({
            key: requestKey,
            kind: "error",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stackBb, requestPath]);

  function handleStackChange(next: number) {
    setStackBb(next);
    setRequestPath([]);
    setSeatResponses({});
    setPostflopBoardSummary([]);
  }

  function handleAction(action: ActionType) {
    if (result?.kind !== "success") return;
    setRequestPath([...requestPath, { actor: result.data.heroPosition, action }]);
  }

  function handleRevisit(globalIndex: number) {
    setRequestPath(requestPath.slice(0, globalIndex));
    // Seats after the truncation point may no longer be reachable on this
    // branch — drop all captured history rather than risk showing a stale
    // seat's range from a line that no longer exists; it recaptures itself
    // as the user replays forward.
    setSeatResponses({});
    setPostflopBoardSummary([]);
  }

  function handleQuickAction(target: Position, action: ActionType) {
    if (result?.kind !== "success") return;
    const order = computeRoundActingOrder(requestPath, result.data.heroPosition, stackBb);
    const targetIdx = order.indexOf(target);
    if (targetIdx <= 0) return;
    const prefixFolds = order.slice(0, targetIdx).map((actor) => ({
      actor,
      action: "fold" as ActionType,
    }));
    const prefixPath = [...requestPath, ...prefixFolds];

    // The quick-action shortcut skips ever making `target` the active seat in
    // its own render, so its own decision-point range (hands) would otherwise
    // never get captured into seatResponses — fetch it directly here so it's
    // available for a postflop hand-off just like a seat reached one click at
    // a time. Fire-and-forget: a stale/aborted result here just means that
    // seat's range isn't captured yet, not a broken UI (the main flow below
    // is unaffected either way).
    solveNode({ effectiveStackBb: stackBb, actionPath: prefixPath })
      .then((data) => {
        if (data.heroPosition === target) {
          setSeatResponses((prev) => ({ ...prev, [target]: data }));
        }
      })
      .catch(() => {});

    setRequestPath([...prefixPath, { actor: target, action }]);
  }

  const current = !loading && result ? result : null;
  const displayedActionPath =
    current?.kind === "success" ? current.data.actionPath : current?.kind === "resolved" ? current.actionPath : [];
  const activeSeat = current?.kind === "success" ? current.data.heroPosition : null;
  const availableActions = current?.kind === "success" ? current.data.availableActions : null;

  // Hoisted out of the "resolved" render block below so both the layout
  // (does the postflop panel actually render?) and the render block itself
  // can share one computation — `current.reason` alone isn't enough (it's a
  // free-form string from the solve API, not a fixed enum); "postflop panel
  // is live" really means "exactly 2 seats live, both ranges captured."
  const resolvedActionPath = current?.kind === "resolved" ? current.actionPath : [];
  const resolvedCommitted = current?.kind === "resolved" ? current.committed : {};
  const liveSeats = Object.entries(resolvedCommitted)
    .filter(([seat]) => {
      const history = resolvedActionPath.filter((n) => n.actor === seat);
      return history.length === 0 || history[history.length - 1].action !== "fold";
    })
    .map(([seat, committedBb]) => ({
      seat: seat as Position,
      remaining: stackBb - (committedBb ?? 0),
    }));
  const bothCaptured = liveSeats.length === 2 && liveSeats.every(({ seat }) => seatResponses[seat] !== undefined);
  // P1 = OOP (acts first postflop — SB first, BTN always last), P2 = IP.
  const [p1, p2] = bothCaptured
    ? [...liveSeats].sort((a, b) => postflopSeatIndex(a.seat) - postflopSeatIndex(b.seat))
    : [];
  const postflopActive = !!(p1 && p2);

  return (
    <div className="mx-auto flex h-screen w-full max-w-6xl flex-col gap-2 overflow-hidden px-6 py-3">
      <StackSizeControl value={stackBb} onChange={handleStackChange} compact />

      <SeatActionBar
        stackBb={stackBb}
        actionPath={displayedActionPath}
        activeSeat={activeSeat}
        availableActions={availableActions}
        loading={loading}
        onAction={handleAction}
        onRevisit={handleRevisit}
        onQuickAction={handleQuickAction}
        trailing={<PostflopBoardStrip streets={postflopBoardSummary} />}
      />

      {current?.kind === "error" && (
        <p className="text-sm text-red-600 dark:text-red-400">Error: {current.message}</p>
      )}

      {(() => {
        if (current?.kind !== "resolved") return null;

        function actionKeyFor(seat: Position): ActionWeightKey {
          const history = resolvedActionPath.filter((n) => n.actor === seat);
          const lastAction = history[history.length - 1]?.action ?? "call";
          return lastAction as ActionWeightKey;
        }

        return (
          <div className="flex flex-1 min-h-0 flex-col gap-3">
            {!postflopActive && (
              <>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {current.reason === "uncontested"
                    ? "Hand ends uncontested — everyone folded."
                    : "Preflop action is closed — multiple players see a flop."}{" "}
                  Pot {current.potBb.toFixed(1)}bb. Undo a seat above to continue exploring.
                </p>

                {current.reason === "action-closed" && (
                  <div className="text-sm text-zinc-500 dark:text-zinc-400">
                    <p className="mb-1">Live to the flop:</p>
                    <ul className="list-inside list-disc">
                      {liveSeats.map(({ seat, remaining }) => (
                        <li key={seat}>
                          {seat} — {remaining.toFixed(1)}bb remaining
                          {seatResponses[seat] ? " (range captured)" : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}

            {current.reason === "action-closed" && !bothCaptured && (
              <p className="text-xs text-zinc-400 dark:text-zinc-600">
                Postflop solving needs exactly 2 live seats with a captured range (Phase 1 doesn&apos;t
                support multiway yet).
              </p>
            )}

            {p1 && p2 && (
              <PostflopPanel
                heroLabel={p1.seat}
                heroHands={seatResponses[p1.seat]!.hands}
                heroActionKey={actionKeyFor(p1.seat)}
                villainLabel={p2.seat}
                villainHands={seatResponses[p2.seat]!.hands}
                villainActionKey={actionKeyFor(p2.seat)}
                startPot={current.potBb}
                effectiveStackBb={Math.min(p1.remaining, p2.remaining)}
                onBoardSummaryChange={setPostflopBoardSummary}
              />
            )}
          </div>
        );
      })()}

      {current?.kind === "success" && (
        <section className="flex flex-1 min-h-0 flex-col gap-2 overflow-hidden">
          <div className="flex items-center gap-3">
            <SourceBadge source={current.data.source} />
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              Pot {current.data.potBb.toFixed(1)}bb
              {current.data.availableActions.call &&
                ` · to call ${current.data.availableActions.call.amountBb.toFixed(1)}bb`}
            </span>
          </div>
          <ActionSummaryTiles hands={current.data.hands} />
          <div className="min-h-0 flex-1">
            <RangeGrid scenario={current.data} />
          </div>
        </section>
      )}
    </div>
  );
}
