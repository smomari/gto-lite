"use client";

import { useEffect, useState } from "react";
import { SettingsButton } from "@/components/Settings/SettingsButton";
import { SettingsDialog } from "@/components/Settings/SettingsDialog";
import { SeatActionBar } from "@/components/TableBar/SeatActionBar";
import { ActionSummaryTiles } from "@/components/ActionSummaryTiles";
import { SourceBadge } from "@/components/SourceBadge";
import { RangeGrid } from "@/components/RangeGrid/RangeGrid";
import { solveNode, SolveApiError } from "@/lib/apiClient/solveClient";
import { TOURNAMENT_8, type GameFormat } from "@/lib/solveEngine/gameFormat";
import { buildFoldPrefixPath } from "@/lib/solveEngine/preview";
import { replayActionPath } from "@/lib/solveEngine/replay";
import { DEFAULT_RAKE_SETTINGS, NO_RAKE, type RakeSettings } from "@/lib/solveEngine/rake";
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
  const [format, setFormat] = useState<GameFormat>(TOURNAMENT_8);
  const [rake, setRake] = useState<RakeSettings>(DEFAULT_RAKE_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** Bumped to send the same request again. */
  const [attempt, setAttempt] = useState(0);
  const [requestPath, setRequestPath] = useState<RequestStep[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  // Every decision-point response seen so far, keyed by the path that led to
  // it (see actionPathKey) — once the hand resolves, each live seat's range
  // entering the flop is the response at its last decision. Only a table
  // change invalidates these; undo/replay just looks up a different key.
  const [rangeByPathKey, setRangeByPathKey] = useState<Record<string, SolveResponse>>({});
  const [failedRangesKey, setFailedRangesKey] = useState<string | null>(null);
  const [streetBarSlot, setStreetBarSlot] = useState<HTMLDivElement | null>(null);

  const table = { effectiveStackBb: stackBb, format: format.id, rake: rake.structure.id, noFlopNoDrop: rake.noFlopNoDrop };
  const requestKey = JSON.stringify({ ...table, requestPath, attempt });
  const loading = result === null || result.key !== requestKey;

  useEffect(() => {
    const controller = new AbortController();

    solveNode({ ...table, actionPath: requestPath }, controller.signal)
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
  }, [requestKey]);

  function handleSettingsApply(nextStackBb: number, nextFormat: GameFormat, nextRake: RakeSettings) {
    setSettingsOpen(false);
    const sameRake = nextRake.structure === rake.structure && nextRake.noFlopNoDrop === rake.noFlopNoDrop;
    if (nextStackBb === stackBb && nextFormat === format && sameRake) return;
    setStackBb(nextStackBb);
    setFormat(nextFormat);
    setRake(nextRake);
    setRequestPath([]);
    setRangeByPathKey({});
  }

  function handleNewHand() {
    setRequestPath([]);
    setAttempt((n) => n + 1);
  }

  function handleAction(action: ActionType) {
    if (current?.kind !== "success") return;
    setRequestPath([...requestPath, { actor: current.data.heroPosition, action }]);
  }

  function handleRevisit(globalIndex: number) {
    setRequestPath(requestPath.slice(0, globalIndex));
  }

  function handleQuickAction(target: Position, action: ActionType) {
    if (current?.kind !== "success") return;
    const prefixPath = buildFoldPrefixPath(requestPath, current.data.heroPosition, target, stackBb, format);
    if (!prefixPath) return;

    setRequestPath([...prefixPath, { actor: target, action }]);
  }

  const current = !loading && result ? result : null;
  // The path is known before the server answers, so a request in flight or a
  // failed one leaves the table on screen rather than blanking it.
  const replayed = replayActionPath(requestPath, stackBb, format);
  const replayedPath = replayed.status === "invalid" ? [] : replayed.canonicalActionPath;
  const displayedActionPath =
    current?.kind === "success" ? current.data.actionPath : current?.kind === "resolved" ? current.actionPath : replayedPath;
  const seatToLoad = loading && replayed.status === "active" ? replayed.activeSeat : null;
  const activeSeat = current?.kind === "success" ? current.data.heroPosition : seatToLoad;
  const availableActions = current?.kind === "success" ? current.data.availableActions : null;

  const handoff =
    current?.kind === "resolved"
      ? resolvePostflopHandoff(current.actionPath, current.committed, stackBb, rangeByPathKey)
      : null;
  // P1 = OOP (acts first postflop — SB first, BTN always last), P2 = IP.
  const [p1, p2] = handoff?.matchup ?? [];
  const postflopActive = !!(p1 && p2);

  // A quick action skips seats' decisions, so their ranges never arrived with a response.
  const missingRanges = handoff?.liveSeats.flatMap((s) => (!s.hands && s.decisionPath ? [s.decisionPath] : [])) ?? [];
  const missingRangesKey = missingRanges.length ? JSON.stringify([requestKey, missingRanges.map(actionPathKey)]) : null;
  const rangeLoadFailed = missingRangesKey !== null && failedRangesKey === missingRangesKey;

  useEffect(() => {
    if (!missingRangesKey) return;
    const controller = new AbortController();
    Promise.all(
      missingRanges.map((path) =>
        solveNode({ ...table, actionPath: path.map(({ actor, action }) => ({ actor, action })) }, controller.signal),
      ),
    )
      .then((responses) => {
        if (controller.signal.aborted) return;
        setRangeByPathKey((prev) => ({ ...prev, ...Object.fromEntries(responses.map((data) => [actionPathKey(data.actionPath), data])) }));
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailedRangesKey(missingRangesKey);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingRangesKey]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-2 px-2 py-2 sm:px-4 lg:h-dvh lg:min-h-0 lg:overflow-hidden lg:px-6 lg:py-3">
      <header className="flex items-center justify-between border-b border-line pb-2">
        <span className="text-xl font-semibold tracking-tight text-ink">gtoLite</span>
        <SettingsButton format={format} rake={rake.structure} stackBb={stackBb} onClick={() => setSettingsOpen(true)} />
      </header>

      {settingsOpen && (
        <SettingsDialog format={format} rake={rake} stackBb={stackBb} onApply={handleSettingsApply} onClose={() => setSettingsOpen(false)} />
      )}

      <SeatActionBar
        stackBb={stackBb}
        format={format}
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
            className="flex shrink-0 items-start gap-1 border-l border-line-strong pl-1 empty:hidden"
          />
        }
      />

      {current?.kind === "error" && (
        <div role="alert" className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-[#d98a82]">Error: {current.message}</p>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-canvas pointer-coarse:min-h-11"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={handleNewHand}
            className="rounded px-3 py-1.5 text-sm text-ink-muted hover:bg-raised hover:text-ink pointer-coarse:min-h-11"
          >
            New hand
          </button>
        </div>
      )}

      {current?.kind === "resolved" && handoff && (
        <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1">
          {!postflopActive && (
            <>
              <p className="text-sm text-ink-muted">
                {current.reason === "uncontested"
                  ? "Hand ends uncontested — everyone folded."
                  : "Preflop action is closed — multiple players see a flop."}{" "}
                Pot {current.potBb.toFixed(1)}bb. Undo a seat above to continue exploring.
              </p>

              {current.reason === "action-closed" && (
                <div className="text-sm text-ink-muted">
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
                <p className="text-xs text-ink-faint">
                  {handoff.liveSeats.length !== 2
                    ? "Postflop solving needs exactly 2 live players (multiway pots aren't supported)."
                    : rangeLoadFailed
                      ? "Couldn't load a player's range."
                      : "Loading both players' ranges…"}
                </p>
              )}

              {rangeLoadFailed && (
                <button
                  type="button"
                  onClick={() => setAttempt((n) => n + 1)}
                  className="self-start rounded px-3 py-1.5 text-sm text-ink-muted hover:bg-raised hover:text-ink pointer-coarse:min-h-11"
                >
                  Retry
                </button>
              )}

              <button
                type="button"
                onClick={handleNewHand}
                className="w-full self-start rounded bg-accent px-3 py-1.5 text-sm font-medium text-canvas pointer-coarse:min-h-11 sm:w-auto"
              >
                New hand
              </button>
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
              rake={format.allowsRake ? rake.structure : NO_RAKE}
              streetBarSlot={streetBarSlot}
              onNewHand={handleNewHand}
            />
          )}
        </div>
      )}

      {current?.kind === "success" && (
        <section className="flex flex-col gap-2 lg:min-h-0 lg:flex-1 lg:overflow-hidden">
          <div className="flex items-center justify-between gap-3">
            <SourceBadge source={current.data.source} />
            <span className="font-mono text-xs tabular-nums text-ink-muted">
              Pot {current.data.potBb.toFixed(1)}bb
              {current.data.availableActions.call &&
                ` · to call ${current.data.availableActions.call.amountBb.toFixed(1)}bb`}
            </span>
          </div>
          <ActionSummaryTiles hands={current.data.hands} />
          <div className="lg:min-h-0 lg:flex-1">
            <RangeGrid scenario={current.data} />
          </div>
        </section>
      )}
    </div>
  );
}
