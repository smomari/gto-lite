"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AboutLink, AppHeader } from "@/components/AppHeader";
import { FirstVisitHint } from "@/components/FirstVisitHint";
import { ShareButton } from "@/components/ShareButton";
import { SettingsButton } from "@/components/Settings/SettingsButton";
import { SettingsDialog } from "@/components/Settings/SettingsDialog";
import { LanguageToggle } from "@/components/Settings/LanguageToggle";
import { SeatActionBar } from "@/components/TableBar/SeatActionBar";
import { ActionSummaryTiles } from "@/components/ActionSummaryTiles";
import { SourceBadge } from "@/components/SourceBadge";
import { RangeGrid } from "@/components/RangeGrid/RangeGrid";
import { GridSkeleton } from "@/components/RangeGrid/GridSkeleton";
import { usePreflopSolve } from "@/lib/apiClient/usePreflopSolve";
import type { GameFormat } from "@/lib/solveEngine/gameFormat";
import { buildFoldPrefixPath } from "@/lib/solveEngine/preview";
import { replayActionPath } from "@/lib/solveEngine/replay";
import { NO_RAKE, type RakeSettings } from "@/lib/solveEngine/rake";
import { CHIP_EV, isChipEv, type IcmStructure } from "@/lib/solveEngine/icm";
import { SEAT_ORDER } from "@/lib/actionTree/seatOrder";
import { PostflopPanel } from "@/components/PostflopBoard/PostflopPanel";
import { HandResolvedNotice } from "@/components/HandResolvedNotice";
import { useMessages } from "@/lib/i18n/locale";
import { EMPTY_LINE, encodeSpot, withSpot, type PostflopLine, type PreflopStep, type Spot } from "@/lib/share/spotLink";
import { initialSpot, storeSettings } from "@/lib/share/storedSettings";
import type { ActionType, Position } from "@/types/rangeData";

const PAGE = "mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-2 px-2 py-2 sm:px-4 lg:h-dvh lg:min-h-0 lg:overflow-hidden lg:px-6 lg:py-3";
const neverChanges = () => () => {};

/**
 * Where a visit starts depends on the address and on what this browser
 * remembers, neither of which the server knows: it renders the page's outline,
 * as does the first client render, and the solver opens once both are read.
 */
export default function Home() {
  const read = useRef<Spot | null>(null);
  const initial = useSyncExternalStore(
    neverChanges,
    () => (read.current ??= initialSpot(window.location.search)),
    () => null,
  );

  if (!initial) {
    return (
      <div className={PAGE}>
        <AppHeader>
          <AboutLink />
        </AppHeader>
        <GridSkeleton />
      </div>
    );
  }
  return <SolverApp initial={initial} />;
}

function SolverApp({ initial }: { initial: Spot }) {
  const t = useMessages();
  const [stackBb, setStackBb] = useState(initial.settings.stackBb);
  const [format, setFormat] = useState<GameFormat>(initial.settings.format);
  const [rake, setRake] = useState<RakeSettings>(initial.settings.rake);
  const [icm, setIcm] = useState<IcmStructure>(initial.settings.icm);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** Bumped to send the same request again. */
  const [attempt, setAttempt] = useState(0);
  const [requestPath, setRequestPath] = useState<PreflopStep[]>(initial.path);
  /** The board and postflop actions on screen; a panel that opens with one plays it back. */
  const [postflopLine, setPostflopLine] = useState<PostflopLine>(initial.postflop);
  const [streetBarSlot, setStreetBarSlot] = useState<HTMLDivElement | null>(null);

  const table = {
    effectiveStackBb: stackBb,
    format: format.id,
    rake: rake.structure.id,
    noFlopNoDrop: rake.noFlopNoDrop,
    icm: format.allowsIcm ? icm.id : CHIP_EV.id,
  };
  const { loading, current, handoff, rangeLoadFailed, responses } = usePreflopSolve(table, requestPath, attempt);

  // The address always describes the spot on screen, so copying it shares the spot.
  const spotQuery = encodeSpot({ settings: { stackBb, format, rake, icm }, path: requestPath, postflop: postflopLine });
  useEffect(() => {
    const query = withSpot(window.location.search, spotQuery);
    const address = `${window.location.pathname}${query ? `?${query}` : ""}`;
    if (address !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, "", address);
  }, [spotQuery]);

  /** A new preflop line starts its postflop from nothing. */
  function goTo(path: PreflopStep[]) {
    setRequestPath(path);
    setPostflopLine(EMPTY_LINE);
  }

  function handleSettingsApply(nextStackBb: number, nextFormat: GameFormat, nextRake: RakeSettings, nextIcm: IcmStructure) {
    setSettingsOpen(false);
    const sameRake = nextRake.structure === rake.structure && nextRake.noFlopNoDrop === rake.noFlopNoDrop;
    if (nextStackBb === stackBb && nextFormat === format && sameRake && nextIcm === icm) return;
    setStackBb(nextStackBb);
    setFormat(nextFormat);
    setRake(nextRake);
    setIcm(nextIcm);
    storeSettings({ stackBb: nextStackBb, format: nextFormat, rake: nextRake, icm: nextIcm });
    goTo([]);
  }

  function handleNewHand() {
    goTo([]);
    setAttempt((n) => n + 1);
  }

  /** The name in the header: back to the first seat, with the settings as they are. */
  function handleStartOver() {
    setSettingsOpen(false);
    handleNewHand();
  }

  function handleAction(action: ActionType) {
    if (current?.kind !== "success") return;
    goTo([...requestPath, { actor: current.data.heroPosition, action }]);
  }

  function handleRevisit(globalIndex: number) {
    goTo(requestPath.slice(0, globalIndex));
  }

  function handleQuickAction(target: Position, action: ActionType) {
    if (current?.kind !== "success") return;
    const prefixPath = buildFoldPrefixPath(requestPath, current.data.heroPosition, target, stackBb, format);
    if (!prefixPath) return;

    goTo([...prefixPath, { actor: target, action }]);
  }

  // The path is known before the server answers, so a request in flight or a
  // failed one leaves the table on screen rather than blanking it.
  const replayed = replayActionPath(requestPath, stackBb, format);
  const replayedPath = replayed.status === "invalid" ? [] : replayed.canonicalActionPath;
  const displayedActionPath =
    current?.kind === "success" ? current.data.actionPath : current?.kind === "resolved" ? current.actionPath : replayedPath;
  const seatToLoad = loading && replayed.status === "active" ? replayed.activeSeat : null;
  const activeSeat = current?.kind === "success" ? current.data.heroPosition : seatToLoad;
  const availableActions = current?.kind === "success" ? current.data.availableActions : null;

  // P1 = OOP (acts first postflop — SB first, BTN always last), P2 = IP.
  const [p1, p2] = handoff?.matchup ?? [];
  const postflopActive = !!(p1 && p2);

  return (
    <div className={PAGE}>
      <AppHeader onHome={handleStartOver}>
        <ShareButton />
        <AboutLink />
        <LanguageToggle />
        <SettingsButton format={format} rake={rake.structure} icm={icm} stackBb={stackBb} onClick={() => setSettingsOpen(true)} />
      </AppHeader>

      {settingsOpen && (
        <SettingsDialog format={format} rake={rake} icm={icm} stackBb={stackBb} onApply={handleSettingsApply} onClose={() => setSettingsOpen(false)} />
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

      {requestPath.length === 0 && <FirstVisitHint />}

      {current?.kind === "error" && (
        <div role="alert" className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-[#d98a82]">{t.common.error(t.errorMessage(current.message))}</p>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-canvas pointer-coarse:min-h-11"
          >
            {t.common.retry}
          </button>
          <button
            type="button"
            onClick={handleNewHand}
            className="rounded px-3 py-1.5 text-sm text-ink-muted hover:bg-raised hover:text-ink pointer-coarse:min-h-11"
          >
            {t.common.newHand}
          </button>
        </div>
      )}

      {current?.kind === "resolved" && handoff && (
        <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1">
          {!postflopActive && (
            <HandResolvedNotice
              reason={current.reason}
              potBb={current.potBb}
              liveSeats={handoff.liveSeats}
              rangeLoadFailed={rangeLoadFailed}
              onRetry={() => setAttempt((n) => n + 1)}
              onNewHand={handleNewHand}
            />
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
              icm={
                format.allowsIcm && !isChipEv(icm)
                  ? { icm: icm.id, seats: SEAT_ORDER.length - format.absentSeats.length, stackBb }
                  : undefined
              }
              explain={{
                game: { format: format.id, stackBb, rake: format.allowsRake ? rake.structure.id : NO_RAKE.id, icm: table.icm },
                oop: p1.seat,
                ip: p2.seat,
                preflop: { actionPath: current.actionPath, responses, potBb: current.potBb },
              }}
              initialLine={postflopLine}
              onLineChange={setPostflopLine}
              streetBarSlot={streetBarSlot}
              onNewHand={handleNewHand}
            />
          )}
        </div>
      )}

      {current?.kind === "success" && (
        <section className="flex flex-col gap-2 lg:min-h-0 lg:flex-1 lg:overflow-hidden">
          <div className="flex items-center justify-between gap-3">
            <SourceBadge source={current.data.source} icm={current.data.icm} />
            <span className="font-mono text-xs tabular-nums text-ink-muted">
              {t.preflop.pot(current.data.potBb.toFixed(1))}
              {current.data.availableActions.call && t.preflop.toCall(current.data.availableActions.call.amountBb.toFixed(1))}
            </span>
          </div>
          <ActionSummaryTiles hands={current.data.hands} />
          <div className="lg:min-h-0 lg:flex-1">
            <RangeGrid scenario={current.data} />
          </div>
        </section>
      )}

      {!current && <GridSkeleton />}
    </div>
  );
}
