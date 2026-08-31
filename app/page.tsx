"use client";

import { useEffect, useState } from "react";
import { StackSizeControl } from "@/components/TableBar/StackSizeControl";
import { SeatActionBar } from "@/components/TableBar/SeatActionBar";
import { ActionSummaryTiles } from "@/components/ActionSummaryTiles";
import { SourceBadge } from "@/components/SourceBadge";
import { RangeGrid } from "@/components/RangeGrid/RangeGrid";
import { solveNode, SolveApiError } from "@/lib/apiClient/solveClient";
import { SEAT_ORDER, seatIndex, postflopSeatIndex } from "@/lib/actionTree/seatOrder";
import { PostflopPanel } from "@/components/PostflopBoard/PostflopPanel";
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
  }

  function handleQuickAction(target: Position, action: ActionType) {
    if (result?.kind !== "success") return;
    const startIdx = seatIndex(result.data.heroPosition);
    const endIdx = seatIndex(target);
    const prefixFolds = SEAT_ORDER.slice(startIdx, endIdx).map((actor) => ({
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

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          GTO Lite — Preflop Range Viewer
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          8-max tournament preflop ranges. Set the table stack, then click through each seat&apos;s
          action to build the hand.
        </p>
      </header>

      <StackSizeControl value={stackBb} onChange={handleStackChange} />

      <SeatActionBar
        stackBb={stackBb}
        actionPath={displayedActionPath}
        activeSeat={activeSeat}
        availableActions={availableActions}
        loading={loading}
        onAction={handleAction}
        onRevisit={handleRevisit}
        onQuickAction={handleQuickAction}
      />

      {current?.kind === "error" && (
        <p className="text-sm text-red-600 dark:text-red-400">Error: {current.message}</p>
      )}

      {(() => {
        if (current?.kind !== "resolved") return null;
        const resolvedActionPath = current.actionPath;
        const liveSeats = Object.entries(current.committed)
          .filter(([seat]) => {
            const history = resolvedActionPath.filter((n) => n.actor === seat);
            return history.length === 0 || history[history.length - 1].action !== "fold";
          })
          .map(([seat, committedBb]) => ({
            seat: seat as Position,
            remaining: stackBb - (committedBb ?? 0),
          }));

        const bothCaptured =
          liveSeats.length === 2 && liveSeats.every(({ seat }) => seatResponses[seat] !== undefined);

        // P1 = OOP (acts first postflop — SB first, BTN always last), P2 = IP.
        const [p1, p2] = bothCaptured
          ? [...liveSeats].sort((a, b) => postflopSeatIndex(a.seat) - postflopSeatIndex(b.seat))
          : [];

        function actionKeyFor(seat: Position): ActionWeightKey {
          const history = resolvedActionPath.filter((n) => n.actor === seat);
          const lastAction = history[history.length - 1]?.action ?? "call";
          return lastAction as ActionWeightKey;
        }

        return (
          <div className="flex flex-col gap-3">
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
              />
            )}
          </div>
        );
      })()}

      {current?.kind === "success" && (
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <SourceBadge source={current.data.source} />
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              Pot {current.data.potBb.toFixed(1)}bb
              {current.data.availableActions.call &&
                ` · to call ${current.data.availableActions.call.amountBb.toFixed(1)}bb`}
            </span>
          </div>
          <ActionSummaryTiles hands={current.data.hands} />
          <RangeGrid scenario={current.data} />
        </section>
      )}
    </div>
  );
}
