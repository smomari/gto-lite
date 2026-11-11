"use client";

import { Fragment, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BoardPicker } from "./BoardPicker";
import { CardChip } from "./CardChip";
import { StreetBox } from "./StreetBox";
import { PostflopActionBar } from "./PostflopActionBar";
import { DecisionStrategyView } from "./DecisionStrategyView";
import { HandSummarySection } from "./HandSummarySection";
import { SolveProgress } from "@/components/PostflopStrategy/SolveProgress";
import { ExploitabilityBadge } from "@/components/PostflopStrategy/ExploitabilityBadge";
import { NextStreetEvNote } from "./NextStreetEvNote";
import { narrowRangeAlongPath } from "@/lib/postflopSolver/rangeNarrowing";
import { DEFAULT_TARGET_EXPLOITABILITY_PERCENT } from "@/lib/postflopSolver/cfr";
import type { RakeStructure } from "@/lib/solveEngine/rake";
import type { PostflopIcm } from "@/lib/postflopSolver/icmPayoffs";
import type { ExplainContext } from "@/lib/explain/buildHandSummary";
import type { ActionWeightKey, SerializedDecisionAction, SerializedTreeNode } from "@/types/postflopSolver";
import type { HandFrequency } from "@/types/rangeData";
import { streetLabelForBoardLength } from "./streetLabel";
import { pickDifferentLabel, streetStartPot, type SolveState, type StreetStage } from "./streetStages";
import { useStreetStages } from "./useStreetStages";

interface PostflopPanelProps {
  heroLabel: string;
  heroHands: HandFrequency[];
  heroActionKey: ActionWeightKey;
  villainLabel: string;
  villainHands: HandFrequency[];
  villainActionKey: ActionWeightKey;
  startPot: number;
  effectiveStackBb: number;
  rake: RakeStructure;
  /** A tournament hand priced in prize money; omitted in chip EV. */
  icm?: PostflopIcm;
  /** Offers an AI explanation once the hand is over. */
  explain?: ExplainContext;
  /** Back to the first preflop decision, once a hand is over. */
  onNewHand: () => void;
  /** Where each street's StreetBox is portaled — the end of the seat-bar row, so the whole hand reads as one timeline. */
  streetBarSlot: HTMLElement | null;
}

/** At or below this many cores the full flop lookahead passes 10s, so the quick one starts ticked. */
const FAST_FLOP_MAX_CORES = 4;

const SECONDARY_BUTTON = "rounded border border-line-strong px-3 py-1 text-sm text-ink hover:bg-raised pointer-coarse:min-h-11";

export function PostflopPanel(props: PostflopPanelProps) {
  const { streets, navigate, resetStreet, pickDifferentBoard, confirmBoard } = useStreetStages(props);
  const [fastFlop, setFastFlop] = useState(() => navigator.hardwareConcurrency <= FAST_FLOP_MAX_CORES);
  const [selectedHand, setSelectedHand] = useState<string | null>(null);
  const [isolatedActionIndex, setIsolatedActionIndex] = useState<number | null>(null);
  const [expandedPastStage, setExpandedPastStage] = useState<number | null>(null);

  // Keep the newest timeline entry (a new street's box, or the seat now to act) in view.
  const boxedStreetCount = streets.filter((s) => s.board.length > 0).length;
  const liveNode = streets[streets.length - 1].currentNode;
  useEffect(() => {
    props.streetBarSlot?.lastElementChild?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [props.streetBarSlot, boxedStreetCount, liveNode]);

  /** The grid's selection/isolation state only ever applies to the current (last) street — clear it any time the current stage's decision context changes. */
  function resetGridSelection() {
    setSelectedHand(null);
    setIsolatedActionIndex(null);
  }

  function handleNavigate(stageIndex: number, action: SerializedDecisionAction) {
    resetGridSelection();
    navigate(stageIndex, action);
  }

  function handleResetStreet(stageIndex: number) {
    resetGridSelection();
    setExpandedPastStage(null);
    resetStreet(stageIndex);
  }

  function handlePickDifferentBoard(stageIndex: number) {
    resetGridSelection();
    setExpandedPastStage(null);
    pickDifferentBoard(stageIndex);
  }

  function handleBoardConfirm(stageIndex: number, cards: string[]) {
    resetGridSelection();
    confirmBoard(stageIndex, cards, fastFlop);
  }

  /**
   * The "done" state's content — identical whether it's the live current
   * street or an expanded past one, since a past stage is (by
   * useStreetStages' own invariant: a next stage is only ever pushed once the
   * previous one reaches a chance node) always resolved there, never at a
   * decision node — so the strategy view below simply never shows for past
   * stages, no separate "past" variant needed.
   */
  function renderDoneContent(
    stage: StreetStage,
    i: number,
    solveState: Extract<SolveState, { kind: "done" }>,
    currentNode: SerializedTreeNode,
  ) {
    const stackLeft = stage.effectiveStackAtStart - (currentNode.type === "decision" ? 0 : currentNode.committed.P1);
    const allIn = currentNode.type === "terminal-showdown" && stackLeft <= 0;
    const handOver = currentNode.type === "terminal-fold" || currentNode.type === "terminal-showdown";
    const links = (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {handOver && (
          <button
            type="button"
            onClick={props.onNewHand}
            className="w-full rounded bg-accent px-3 py-1.5 text-sm font-medium text-canvas pointer-coarse:min-h-11"
          >
            New hand
          </button>
        )}
        <button
          type="button"
          onClick={() => handleResetStreet(i)}
          className={SECONDARY_BUTTON}
        >
          Reset to start of street
        </button>
        <button
          type="button"
          onClick={() => handlePickDifferentBoard(i)}
          className={SECONDARY_BUTTON}
        >
          {pickDifferentLabel(stage)}
        </button>
      </div>
    );
    return (
      <>
        {solveState.result.exploitability && <ExploitabilityBadge exploitability={solveState.result.exploitability} />}
        {(currentNode.type === "terminal-fold" || currentNode.type === "terminal-showdown") && (
          <HandSummarySection
            streets={streets}
            stageIndex={i}
            node={currentNode}
            allIn={allIn}
            preflopPot={props.startPot}
            heroLabel={props.heroLabel}
            villainLabel={props.villainLabel}
            rake={props.rake}
            actions={links}
            explain={props.explain}
          />
        )}
        {currentNode.type === "chance" && (
          <>
            <p className="text-sm text-ink-muted">
              Street ends — pot {currentNode.potBb.toFixed(1)}bb, {streetLabelForBoardLength(stage.board.length + 1).toLowerCase()} card
              coming next.
            </p>
            {currentNode.nextStreetEv && (
              <NextStreetEvNote
                ev={currentNode.nextStreetEv}
                heroLabel={props.heroLabel}
                villainLabel={props.villainLabel}
                nextStreetLabel={streetLabelForBoardLength(stage.board.length + 1)}
              />
            )}
          </>
        )}
        {currentNode.type === "decision" && (
          <DecisionStrategyView
            node={currentNode}
            range={narrowRangeAlongPath(
              currentNode.actor === "P1" ? solveState.result.heroRange : solveState.result.villainRange,
              currentNode.actor,
              stage.path,
            )}
            board={stage.board}
            heroLabel={props.heroLabel}
            villainLabel={props.villainLabel}
            selectedHand={selectedHand}
            onSelectHand={setSelectedHand}
            isolatedActionIndex={isolatedActionIndex}
            onIsolateChange={setIsolatedActionIndex}
          />
        )}
        {!handOver && links}
      </>
    );
  }

  const liveIndex = streets.length - 1;
  const live = streets[liveIndex];
  const liveIsFlop = live.streetLabel === "Flop";

  function renderPastStreetDetails(i: number) {
    const stage = streets[i];
    // Invariant: a stage is only ever non-last once its own action reached a
    // chance node (see useStreetStages' navigate) — so a past stage is always done.
    if (stage.state.kind !== "done" || !stage.currentNode) return null;
    return (
      <div
        data-testid="past-street-details"
        className="absolute inset-x-4 top-4 z-10 flex max-h-[80%] flex-col gap-2 overflow-y-auto rounded-lg border border-line-strong bg-surface p-3"
      >
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {stage.streetLabel}
          </h3>
          <div className="flex gap-0.5">
            {stage.board.map((card) => (
              <CardChip key={card} card={card} size="sm" />
            ))}
          </div>
          <button
            type="button"
            aria-label="Close details"
            onClick={() => setExpandedPastStage(null)}
            className="ml-auto rounded px-2 text-ink-muted hover:bg-raised hover:text-ink"
          >
            ✕
          </button>
        </div>
        {renderDoneContent(stage, i, stage.state, stage.currentNode)}
      </div>
    );
  }

  // Each street's divider box, then its seat boxes — the same row as the
  // preflop seats, so the whole hand reads left-to-right as one timeline.
  const timeline = streets.map((stage, i) => {
    if (stage.board.length === 0) return null;
    const isLive = i === liveIndex;
    return (
      <Fragment key={i}>
        <StreetBox
          streetLabel={stage.streetLabel}
          cards={stage.board.slice(i === 0 ? 0 : streets[i - 1].board.length)}
          potBb={streetStartPot(streets, i, props.startPot)}
          status={isLive ? "live" : "past"}
          selected={expandedPastStage === i}
          onClick={() => setExpandedPastStage(expandedPastStage === i ? null : i)}
        />
        <PostflopActionBar
          node={isLive ? stage.currentNode : null}
          history={stage.path.map((step) => ({ actor: step.node.actor, label: step.node.actions[step.actionIndex].label }))}
          heroLabel={props.heroLabel}
          villainLabel={props.villainLabel}
          onNavigate={(action) => handleNavigate(i, action)}
        />
      </Fragment>
    );
  });

  return (
    <div className="relative flex flex-col gap-2 lg:min-h-0 lg:flex-1 lg:overflow-hidden">
      {props.streetBarSlot && createPortal(timeline, props.streetBarSlot)}

      <h2 className="text-xs text-ink-muted">
        {props.heroLabel} vs {props.villainLabel}
      </h2>

      <div
        data-testid="street-stage"
        data-street={live.streetLabel}
        className="flex flex-col gap-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
      >
        {live.state.kind === "idle" && (
          <BoardPicker
            key={liveIndex}
            count={liveIsFlop ? 3 : 1}
            excludedCards={liveIndex === 0 ? [] : streets[liveIndex - 1].board}
            title={liveIsFlop ? "Pick the 3 flop cards" : `Pick the ${live.streetLabel.toLowerCase()} card`}
            confirmLabel={`Solve ${live.streetLabel.toLowerCase()}`}
            onConfirm={(cards) => handleBoardConfirm(liveIndex, cards)}
          />
        )}

        {live.state.kind === "idle" && liveIsFlop && (
          <label className="flex items-center gap-1.5 text-xs text-ink-muted">
            <input type="checkbox" checked={fastFlop} onChange={(e) => setFastFlop(e.target.checked)} />
            Fast flop: look ahead to the turn only (quicker, less accurate)
          </label>
        )}

        {live.state.kind === "solving" && (
          <SolveProgress
            phase={live.state.phase}
            done={live.state.done}
            total={live.state.total}
            exploitabilityPercent={live.state.exploitabilityPercent}
            targetExploitabilityPercent={DEFAULT_TARGET_EXPLOITABILITY_PERCENT}
          />
        )}

        {live.state.kind === "error" && (
          <>
            <p role="alert" className="text-sm text-[#d98a82]">
              Error: {live.state.message}
            </p>
            <div>
              <button
                type="button"
                onClick={() => handlePickDifferentBoard(liveIndex)}
                className={SECONDARY_BUTTON}
              >
                {pickDifferentLabel(live)}
              </button>
            </div>
          </>
        )}

        {live.state.kind === "done" && live.currentNode && renderDoneContent(live, liveIndex, live.state, live.currentNode)}
      </div>

      {expandedPastStage !== null && expandedPastStage < liveIndex && renderPastStreetDetails(expandedPastStage)}
    </div>
  );
}
