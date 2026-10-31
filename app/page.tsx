"use client";

import { useEffect, useRef, useState } from "react";
import { StackSizeControl } from "@/components/TableBar/StackSizeControl";
import { SeatActionBar } from "@/components/TableBar/SeatActionBar";
import { ActionSummaryTiles } from "@/components/ActionSummaryTiles";
import { SourceBadge } from "@/components/SourceBadge";
import { RangeGrid } from "@/components/RangeGrid/RangeGrid";
import { solveNode, SolveApiError } from "@/lib/apiClient/solveClient";
import { buildFoldPrefixPath } from "@/lib/solveEngine/preview";
import { actionPathKey, resolvePostflopHandoff } from "@/lib/solveEngine/postflopHandoff";
import { PostflopPanel } from "@/components/PostflopBoard/PostflopPanel";
import type { ActionNode, ActionType, Position } from "@/types/rangeData";
import type { SolveResponse } from "@/types/solveApi";

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
  // Every decision-point response seen so far, keyed by the path that led to
  // it (see actionPathKey) — once the hand resolves, each live seat's range
  // entering the flop is the response at its last decision. Only a stack
  // change invalidates these; undo/replay just looks up a different key.
  const [rangeByPathKey, setRangeByPathKey] = useState<Record<string, SolveResponse>>({});
  const [rangeLoadFailed, setRangeLoadFailed] = useState(false);
  // Quick-action range fetches still in flight: their keys don't include the
  // stack, so a stack change has to cancel them or they'd land in its new map.
  const rangeFetchesRef = useRef(new Set<AbortController>());
  const [streetBarSlot, setStreetBarSlot] = useState<HTMLDivElement | null>(null);

  const requestKey = JSON.stringify({ stackBb, requestPath });
  const loading = result === null || result.key !== requestKey;

  useEffect(() => {
    const controller = new AbortController();

    solveNode({ effectiveStackBb: stackBb, actionPath: requestPath }, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setResult({ key: requestKey, kind: "success", data });
        setRangeByPathKey((prev) => ({ ...prev, [actionPathKey(data.actionPath)]: data }));
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
    for (const controller of rangeFetchesRef.current) controller.abort();
    rangeFetchesRef.current.clear();
    setStackBb(next);
    setRequestPath([]);
    setRangeByPathKey({});
    setRangeLoadFailed(false);
  }

  function handleAction(action: ActionType) {
    if (result?.kind !== "success") return;
    setRequestPath([...requestPath, { actor: result.data.heroPosition, action }]);
  }

  function handleRevisit(globalIndex: number) {
    setRequestPath(requestPath.slice(0, globalIndex));
    setRangeLoadFailed(false);
  }

  function handleQuickAction(target: Position, action: ActionType) {
    if (result?.kind !== "success") return;
    const prefixPath = buildFoldPrefixPath(requestPath, result.data.heroPosition, target, stackBb);
    if (!prefixPath) return;

    // The quick-action shortcut skips ever making `target` the active seat in
    // its own render, so its decision-point range would otherwise never be
    // captured — fetch it directly so a postflop hand-off has it, just like a
    // seat reached one click at a time. Not awaited: the hand moves on, and a
    // failed fetch only shows up if the hand-off ends up needing this range.
    const controller = new AbortController();
    rangeFetchesRef.current.add(controller);
    solveNode({ effectiveStackBb: stackBb, actionPath: prefixPath }, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        if (data.heroPosition === target) {
          setRangeByPathKey((prev) => ({ ...prev, [actionPathKey(data.actionPath)]: data }));
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setRangeLoadFailed(true);
      })
      .finally(() => rangeFetchesRef.current.delete(controller));

    setRequestPath([...prefixPath, { actor: target, action }]);
  }

  const current = !loading && result ? result : null;
  const displayedActionPath =
    current?.kind === "success" ? current.data.actionPath : current?.kind === "resolved" ? current.actionPath : [];
  const activeSeat = current?.kind === "success" ? current.data.heroPosition : null;
  const availableActions = current?.kind === "success" ? current.data.availableActions : null;

  const handoff =
    current?.kind === "resolved"
      ? resolvePostflopHandoff(current.actionPath, current.committed, stackBb, rangeByPathKey)
      : null;
  // P1 = OOP (acts first postflop — SB first, BTN always last), P2 = IP.
  const [p1, p2] = handoff?.matchup ?? [];
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
        trailing={
          <div
            ref={setStreetBarSlot}
            data-testid="street-bar-slot"
            className="flex shrink-0 items-start gap-2 border-l border-zinc-300 pl-2 empty:hidden dark:border-zinc-700"
          />
        }
      />

      {current?.kind === "error" && (
        <p className="text-sm text-red-600 dark:text-red-400">Error: {current.message}</p>
      )}

      {current?.kind === "resolved" && handoff && (
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
                    {handoff.liveSeats.map(({ seat, remainingBb }) => (
                      <li key={seat}>
                        {seat} — {remainingBb.toFixed(1)}bb remaining
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {current.reason === "action-closed" && (
                <p className="text-xs text-zinc-400 dark:text-zinc-600">
                  {handoff.liveSeats.length !== 2
                    ? "Postflop solving needs exactly 2 live players (Phase 1 doesn't support multiway yet)."
                    : rangeLoadFailed
                      ? "Couldn't load a player's range. Undo a seat above to try again."
                      : "Loading both players' ranges…"}
                </p>
              )}
            </>
          )}

          {p1 && p2 && (
            <PostflopPanel
              heroLabel={p1.seat}
              heroHands={p1.hands}
              heroActionKey={p1.actionKey}
              villainLabel={p2.seat}
              villainHands={p2.hands}
              villainActionKey={p2.actionKey}
              startPot={current.potBb}
              effectiveStackBb={Math.min(p1.remainingBb, p2.remainingBb)}
              streetBarSlot={streetBarSlot}
            />
          )}
        </div>
      )}

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
