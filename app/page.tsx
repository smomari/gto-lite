"use client";

import { useEffect, useState } from "react";
import { StackSizeControl } from "@/components/TableBar/StackSizeControl";
import { SeatActionBar } from "@/components/TableBar/SeatActionBar";
import { ActionSummaryTiles } from "@/components/ActionSummaryTiles";
import { SourceBadge } from "@/components/SourceBadge";
import { RangeGrid } from "@/components/RangeGrid/RangeGrid";
import { solveNode, SolveApiError } from "@/lib/apiClient/solveClient";
import { SEAT_ORDER, seatIndex } from "@/lib/actionTree/seatOrder";
import type { ActionNode, ActionType, Position } from "@/types/rangeData";
import type { SolveResponse } from "@/types/solveApi";

interface RequestStep {
  actor: Position;
  action: ActionType;
}

type Result =
  | { key: string; kind: "success"; data: SolveResponse }
  | { key: string; kind: "resolved"; reason: string; actionPath: ActionNode[]; potBb: number }
  | { key: string; kind: "error"; message: string };

export default function Home() {
  const [stackBb, setStackBb] = useState(100);
  const [requestPath, setRequestPath] = useState<RequestStep[]>([]);
  const [result, setResult] = useState<Result | null>(null);

  const requestKey = JSON.stringify({ stackBb, requestPath });
  const loading = result === null || result.key !== requestKey;

  useEffect(() => {
    const controller = new AbortController();

    solveNode({ effectiveStackBb: stackBb, actionPath: requestPath }, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setResult({ key: requestKey, kind: "success", data });
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
  }

  function handleAction(action: ActionType) {
    if (result?.kind !== "success") return;
    setRequestPath([...requestPath, { actor: result.data.heroPosition, action }]);
  }

  function handleRevisit(globalIndex: number) {
    setRequestPath(requestPath.slice(0, globalIndex));
  }

  function handleQuickAction(target: Position, action: ActionType) {
    if (result?.kind !== "success") return;
    const startIdx = seatIndex(result.data.heroPosition);
    const endIdx = seatIndex(target);
    const prefixFolds = SEAT_ORDER.slice(startIdx, endIdx).map((actor) => ({
      actor,
      action: "fold" as ActionType,
    }));
    setRequestPath([...requestPath, ...prefixFolds, { actor: target, action }]);
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

      {current?.kind === "resolved" && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {current.reason === "uncontested"
            ? "Hand ends uncontested — everyone folded."
            : "Preflop action is closed — multiple players see a flop."}{" "}
          Pot {current.potBb.toFixed(1)}bb. Undo a seat above to continue exploring.
        </p>
      )}

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
