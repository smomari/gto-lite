"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BoardPicker } from "./BoardPicker";
import { CardChip } from "./CardChip";
import { StreetBox } from "./StreetBox";
import { PostflopActionBar } from "./PostflopActionBar";
import { PostflopHandSummary, type HandOutcome } from "./PostflopHandSummary";
import { PostflopRangeGrid } from "@/components/PostflopStrategy/PostflopRangeGrid";
import { BetSizeFilterBar } from "@/components/PostflopStrategy/BetSizeFilterBar";
import { SuitedComboBreakdown } from "@/components/PostflopStrategy/SuitedComboBreakdown";
import { buildActionColorScale } from "@/components/PostflopStrategy/postflopColorLegend";
import { SolveProgress } from "@/components/PostflopStrategy/SolveProgress";
import { ExploitabilityBadge } from "@/components/PostflopStrategy/ExploitabilityBadge";
import { NextStreetEvNote } from "./NextStreetEvNote";
import { solvePostflopInWorker } from "@/lib/postflopSolver/worker/workerClient";
import { narrowRangeAlongPath, type TreePathStep } from "@/lib/postflopSolver/rangeNarrowing";
import { DEFAULT_MAX_CFR_ITERATIONS, DEFAULT_TARGET_EXPLOITABILITY_PERCENT } from "@/lib/postflopSolver/cfr";
import { rakeablePot } from "@/lib/postflopSolver/potState";
import { rakeForPot, type RakeStructure } from "@/lib/solveEngine/rake";
import type {
  ActionWeightKey,
  PostflopResultMessage,
  PostflopSolvePhase,
  PostflopSolveRequest,
  SerializedDecisionAction,
  SerializedTreeNode,
} from "@/types/postflopSolver";
import type { HandFrequency } from "@/types/rangeData";
import { streetLabelForBoardLength, type StreetLabel } from "./streetLabel";

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
  /** Back to the first preflop decision, once a hand is over. */
  onNewHand: () => void;
  /** Where each street's StreetBox is portaled — the end of the seat-bar row, so the whole hand reads as one timeline. */
  streetBarSlot: HTMLElement | null;
}

type SolveState =
  | { kind: "idle" }
  | { kind: "solving"; phase: PostflopSolvePhase; done: number; total: number; exploitabilityPercent?: number }
  | { kind: "done"; result: PostflopResultMessage }
  | { kind: "error"; message: string };

/**
 * One street's worth of state: board picking, solving, and tree navigation.
 * Kept as an array so flop/turn/river all share the same shape and rendering
 * logic instead of separate per-street fields.
 */
interface StreetStage {
  streetLabel: StreetLabel;
  /** Cumulative board through this stage (3/4/5 cards for flop/turn/river). */
  board: string[];
  state: SolveState;
  currentNode: SerializedTreeNode | null;
  path: TreePathStep[];
  /** Effective stack behind at the start of this street (before any of this street's action). */
  effectiveStackAtStart: number;
}

function idleStage(boardLength: number, effectiveStackAtStart: number): StreetStage {
  return {
    streetLabel: streetLabelForBoardLength(boardLength),
    board: [],
    state: { kind: "idle" },
    currentNode: null,
    path: [],
    effectiveStackAtStart,
  };
}

/** At or below this many cores the full flop lookahead passes 10s, so the quick one starts ticked. */
const FAST_FLOP_MAX_CORES = 4;

export function PostflopPanel(props: PostflopPanelProps) {
  const [streets, setStreets] = useState<StreetStage[]>([idleStage(3, props.effectiveStackBb)]);
  const [fastFlop, setFastFlop] = useState(() => navigator.hardwareConcurrency <= FAST_FLOP_MAX_CORES);
  const solveAbortRef = useRef(new Map<number, AbortController>());
  const [selectedHand, setSelectedHand] = useState<string | null>(null);
  const [isolatedActionIndex, setIsolatedActionIndex] = useState<number | null>(null);
  const [expandedPastStage, setExpandedPastStage] = useState<number | null>(null);

  // Below the chart on small screens, a tapped hand's combos would otherwise sit off-screen.
  const comboDetailRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selectedHand && !window.matchMedia?.("(min-width: 1024px)").matches) {
      comboDetailRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedHand]);

  // Keep the newest timeline entry (a new street's box, or the seat now to act) in view.
  const boxedStreetCount = streets.filter((s) => s.board.length > 0).length;
  const liveNode = streets[streets.length - 1].currentNode;
  useEffect(() => {
    props.streetBarSlot?.lastElementChild?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [props.streetBarSlot, boxedStreetCount, liveNode]);

  useEffect(() => {
    const solves = solveAbortRef.current;
    return () => {
      for (const controller of solves.values()) controller.abort();
      solves.clear();
    };
  }, []);

  /** In-flight solves write back by stage index, so any stage at or after a truncation point must be cancelled before its slot is reused or removed. */
  function abortSolvesFrom(stageIndex: number) {
    for (const [index, controller] of solveAbortRef.current) {
      if (index >= stageIndex) {
        controller.abort();
        solveAbortRef.current.delete(index);
      }
    }
  }

  /** The grid's selection/isolation state only ever applies to the current (last) street — clear it any time the current stage's decision context changes. */
  function resetGridSelection() {
    setSelectedHand(null);
    setIsolatedActionIndex(null);
  }

  function handleNavigate(stageIndex: number, action: SerializedDecisionAction) {
    abortSolvesFrom(stageIndex);
    resetGridSelection();
    setStreets((prev) => {
      const stage = prev[stageIndex];
      if (stage.currentNode?.type !== "decision") return prev;
      const actionIndex = stage.currentNode.actions.indexOf(action);
      const updatedStage: StreetStage = {
        ...stage,
        currentNode: action.child,
        path: [...stage.path, { node: stage.currentNode, actionIndex }],
      };
      const next = [...prev.slice(0, stageIndex), updatedStage];

      // A chance node is where a street that looked ahead closes with stack
      // behind: the next street still gets its own full solve. An all-in has
      // its runout equity in this street's result, and the river closes on a showdown.
      if (action.child.type === "chance") {
        next.push(idleStage(stage.board.length + 1, stage.effectiveStackAtStart - action.child.committed.P1));
      }

      return next;
    });
  }

  function handleResetStreet(stageIndex: number) {
    abortSolvesFrom(stageIndex);
    resetGridSelection();
    setExpandedPastStage(null);
    setStreets((prev) => {
      const stage = prev[stageIndex];
      if (stage.state.kind !== "done") return prev;
      return [...prev.slice(0, stageIndex), { ...stage, currentNode: stage.state.result.tree, path: [] }];
    });
  }

  function handlePickDifferentBoard(stageIndex: number) {
    abortSolvesFrom(stageIndex);
    resetGridSelection();
    setExpandedPastStage(null);
    setStreets((prev) => [
      ...prev.slice(0, stageIndex),
      { ...prev[stageIndex], board: [], state: { kind: "idle" }, currentNode: null, path: [] },
    ]);
  }

  function handleBoardConfirm(stageIndex: number, cards: string[]) {
    resetGridSelection();
    const fullBoard = stageIndex === 0 ? cards : [...streets[stageIndex - 1].board, ...cards];

    let request: PostflopSolveRequest;
    if (stageIndex === 0) {
      request = {
        kind: "canonical",
        board: fullBoard,
        heroHandFrequencies: props.heroHands,
        heroActionKey: props.heroActionKey,
        villainHandFrequencies: props.villainHands,
        villainActionKey: props.villainActionKey,
        startPot: props.startPot,
        effectiveStackBb: props.effectiveStackBb,
        maxIterations: DEFAULT_MAX_CFR_ITERATIONS,
        targetExploitabilityPercent: DEFAULT_TARGET_EXPLOITABILITY_PERCENT,
        fast: fastFlop,
        rake: props.rake,
      };
    } else {
      const prevStage = streets[stageIndex - 1];
      const terminal = prevStage.currentNode;
      if (prevStage.state.kind !== "done" || terminal?.type !== "chance") {
        throw new Error("handleBoardConfirm: the next street requires the previous street to end at a chance node");
      }
      request = {
        kind: "combos",
        board: fullBoard,
        heroRange: narrowRangeAlongPath(prevStage.state.result.heroRange, "P1", prevStage.path),
        villainRange: narrowRangeAlongPath(prevStage.state.result.villainRange, "P2", prevStage.path),
        startPot: terminal.potBb,
        effectiveStackBb: prevStage.effectiveStackAtStart - terminal.committed.P1,
        maxIterations: DEFAULT_MAX_CFR_ITERATIONS,
        targetExploitabilityPercent: DEFAULT_TARGET_EXPLOITABILITY_PERCENT,
        rake: props.rake,
      };
    }

    setStreets((prev) => {
      const next = [...prev];
      next[stageIndex] = {
        ...next[stageIndex],
        board: fullBoard,
        state: { kind: "solving", phase: "equity", done: 0, total: 1 },
        currentNode: null,
        path: [],
      };
      return next;
    });

    abortSolvesFrom(stageIndex);
    const controller = new AbortController();
    solveAbortRef.current.set(stageIndex, controller);
    const finish = () => {
      if (solveAbortRef.current.get(stageIndex) === controller) solveAbortRef.current.delete(stageIndex);
    };

    solvePostflopInWorker(request, {
      signal: controller.signal,
      onProgress: (phase, done, total, exploitabilityPercent) => {
        if (controller.signal.aborted) return;
        setStreets((prev) => {
          const next = [...prev];
          next[stageIndex] = { ...next[stageIndex], state: { kind: "solving", phase, done, total, exploitabilityPercent } };
          return next;
        });
      },
    })
      .then((result) => {
        if (controller.signal.aborted) return;
        finish();
        setStreets((prev) => {
          const next = [...prev];
          next[stageIndex] = { ...next[stageIndex], state: { kind: "done", result }, currentNode: result.tree };
          return next;
        });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        finish();
        const message = err instanceof Error ? err.message : String(err);
        setStreets((prev) => {
          const next = [...prev];
          next[stageIndex] = { ...next[stageIndex], state: { kind: "error", message } };
          return next;
        });
      });
  }

  /**
   * The "done" state's content — identical whether it's the live current
   * street or an expanded past one, since a past stage is (by
   * PostflopPanel's own invariant: a next stage is only ever pushed once the
   * previous one reaches a chance node) always resolved there, never at a
   * decision node — so the 2-column grid branch
   * below simply never fires for past stages, no separate "past" variant needed.
   */
  function renderDoneContent(
    stage: StreetStage,
    i: number,
    solveState: Extract<SolveState, { kind: "done" }>,
    currentNode: SerializedTreeNode,
  ) {
    const isFlop = stage.streetLabel === "Flop";
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
          className="text-xs text-ink-muted underline hover:text-ink pointer-coarse:py-2"
        >
          Reset to start of street
        </button>
        <button
          type="button"
          onClick={() => handlePickDifferentBoard(i)}
          className="text-xs text-ink-muted underline hover:text-ink pointer-coarse:py-2"
        >
          {isFlop ? "Pick a different board" : `Pick a different ${stage.streetLabel.toLowerCase()} card`}
        </button>
      </div>
    );
    return (
      <>
        {solveState.result.exploitability && <ExploitabilityBadge exploitability={solveState.result.exploitability} />}
        {handOver && renderHandSummary(stage, i, solveState, currentNode, allIn, links)}
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
        {currentNode.type === "decision" &&
          (() => {
            const decisionNode = currentNode;
            const actionColors = buildActionColorScale(decisionNode.actions);
            const streetRange = decisionNode.actor === "P1" ? solveState.result.heroRange : solveState.result.villainRange;
            const range = narrowRangeAlongPath(streetRange, decisionNode.actor, stage.path);
            return (
              <div className="grid grid-cols-1 gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="flex flex-col gap-2 lg:min-h-0">
                  <BetSizeFilterBar
                    node={decisionNode}
                    range={range}
                    colors={actionColors}
                    isolatedActionIndex={isolatedActionIndex}
                    onIsolateChange={setIsolatedActionIndex}
                  />
                  <div className="lg:min-h-0 lg:flex-1">
                    <PostflopRangeGrid
                      range={range}
                      node={decisionNode}
                      colors={actionColors}
                      isolatedActionIndex={isolatedActionIndex}
                      selectedHand={selectedHand}
                      onSelectHand={setSelectedHand}
                    />
                  </div>
                </div>
                <div
                  ref={comboDetailRef}
                  className="flex flex-col gap-3 border-t border-line pt-3 lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0"
                >
                  <SuitedComboBreakdown
                    selectedHand={selectedHand}
                    node={decisionNode}
                    range={range}
                    board={stage.board}
                    colors={actionColors}
                    heroLabel={props.heroLabel}
                    villainLabel={props.villainLabel}
                  />
                </div>
              </div>
            );
          })()}
        {!handOver && links}
      </>
    );
  }

  function renderHandSummary(
    stage: StreetStage,
    i: number,
    solveState: Extract<SolveState, { kind: "done" }>,
    node: SerializedTreeNode,
    allIn: boolean,
    links: ReactNode,
  ) {
    if (node.type !== "terminal-fold" && node.type !== "terminal-showdown") return null;
    const firstStage = streets[0].state;
    if (firstStage.kind !== "done") return null;
    const seatLabel = (actor: "P1" | "P2") => (actor === "P1" ? props.heroLabel : props.villainLabel);
    const outcome: HandOutcome =
      node.type === "terminal-fold"
        ? { kind: "fold", winnerLabel: seatLabel(node.winner!) }
        : allIn
          ? { kind: "allin", note: `All-in — hand is already decided, pot ${node.potBb.toFixed(1)}bb runs out to showdown automatically.` }
          : { kind: "showdown" };
    return (
      <PostflopHandSummary
        outcome={outcome}
        board={stage.board}
        potBb={node.potBb}
        rakeBb={rakeForPot(rakeablePot(node.potBb - node.committed.P1 - node.committed.P2, node.committed), props.rake)}
        equity={node.type === "terminal-showdown" ? node.checkdownEquity : undefined}
        streets={streets.slice(0, i + 1).map((street, k) => ({
          label: street.streetLabel,
          potBb: k === i ? node.potBb : streetStartPot(k + 1),
          actions: street.path.map((step) => `${seatLabel(step.node.actor)} ${step.node.actions[step.actionIndex].label}`),
        }))}
        hero={{ label: props.heroLabel, start: firstStage.result.heroRange, end: narrowRangeAlongPath(solveState.result.heroRange, "P1", stage.path) }}
        villain={{ label: props.villainLabel, start: firstStage.result.villainRange, end: narrowRangeAlongPath(solveState.result.villainRange, "P2", stage.path) }}
        actions={links}
      />
    );
  }

  /** Pot entering street `i` — the previous street's closing pot, or the preflop pot for the flop. */
  function streetStartPot(i: number): number {
    return i === 0 ? props.startPot : (streets[i - 1].currentNode?.potBb ?? props.startPot);
  }

  const liveIndex = streets.length - 1;
  const live = streets[liveIndex];
  const liveIsFlop = live.streetLabel === "Flop";

  function renderPastStreetDetails(i: number) {
    const stage = streets[i];
    // Invariant: a stage is only ever non-last once its own action reached a
    // chance node (see handleNavigate) — so a past stage is always done.
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
          potBb={streetStartPot(i)}
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
                className="text-xs text-ink-muted underline hover:text-ink pointer-coarse:py-2"
              >
                {liveIsFlop ? "Pick a different board" : `Pick a different ${live.streetLabel.toLowerCase()} card`}
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
