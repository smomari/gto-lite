"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BoardPicker } from "./BoardPicker";
import { CardChip } from "./CardChip";
import { StreetBox } from "./StreetBox";
import { PostflopActionBar } from "./PostflopActionBar";
import { PostflopTerminalMessage } from "./PostflopTerminalMessage";
import { PostflopRangeGrid } from "@/components/PostflopStrategy/PostflopRangeGrid";
import { BetSizeFilterBar } from "@/components/PostflopStrategy/BetSizeFilterBar";
import { SuitedComboBreakdown } from "@/components/PostflopStrategy/SuitedComboBreakdown";
import { buildActionColorScale } from "@/components/PostflopStrategy/postflopColorLegend";
import { SolveProgress } from "@/components/PostflopStrategy/SolveProgress";
import { ExploitabilityBadge } from "@/components/PostflopStrategy/ExploitabilityBadge";
import { CheckdownEquityNote } from "./CheckdownEquityNote";
import { AverageNextCardEv, type PreciseAvgState } from "./AverageNextCardEv";
import { NextStreetEvNote } from "./NextStreetEvNote";
import { solvePostflopInWorker } from "@/lib/postflopSolver/worker/workerClient";
import { narrowRangeAlongPath, type TreePathStep } from "@/lib/postflopSolver/rangeNarrowing";
import { DEFAULT_MAX_CFR_ITERATIONS, DEFAULT_TARGET_EXPLOITABILITY_PERCENT } from "@/lib/postflopSolver/cfr";
import { DEFAULT_PRECISE_SAMPLE_COUNT, sampleNextCards } from "@/lib/postflopSolver/nextCardSampling";
import type {
  ActionWeightKey,
  PostflopResultMessage,
  PostflopSolvePhase,
  PostflopSolveRequest,
  SerializedDecisionAction,
  SerializedTreeNode,
} from "@/types/postflopSolver";
import type { HandFrequency } from "@/types/rangeData";
import { hasNextStreet, streetLabelForBoardLength, type StreetLabel } from "./streetLabel";

interface PostflopPanelProps {
  heroLabel: string;
  heroHands: HandFrequency[];
  heroActionKey: ActionWeightKey;
  villainLabel: string;
  villainHands: HandFrequency[];
  villainActionKey: ActionWeightKey;
  startPot: number;
  effectiveStackBb: number;
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

export function PostflopPanel(props: PostflopPanelProps) {
  const [streets, setStreets] = useState<StreetStage[]>([idleStage(3, props.effectiveStackBb)]);
  const [preciseAvgByStage, setPreciseAvgByStage] = useState<Record<number, PreciseAvgState>>({});
  const preciseAbortRef = useRef<{ stageIndex: number; controller: AbortController } | null>(null);
  const solveAbortRef = useRef(new Map<number, AbortController>());
  const [selectedHand, setSelectedHand] = useState<string | null>(null);
  const [isolatedActionIndex, setIsolatedActionIndex] = useState<number | null>(null);
  const [expandedPastStage, setExpandedPastStage] = useState<number | null>(null);

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
      preciseAbortRef.current?.controller.abort();
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
    if (preciseAbortRef.current && preciseAbortRef.current.stageIndex >= stageIndex) {
      preciseAbortRef.current.controller.abort();
      preciseAbortRef.current = null;
    }
  }

  function clearPreciseAvgFrom(stageIndex: number) {
    setPreciseAvgByStage((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (Number(key) >= stageIndex) delete next[Number(key)];
      }
      return next;
    });
  }

  /** The grid's selection/isolation state only ever applies to the current (last) street — clear it any time the current stage's decision context changes. */
  function resetGridSelection() {
    setSelectedHand(null);
    setIsolatedActionIndex(null);
  }

  function handleNavigate(stageIndex: number, action: SerializedDecisionAction) {
    abortSolvesFrom(stageIndex);
    clearPreciseAvgFrom(stageIndex);
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

      // A live stack still behind, on a street short of the river, is what
      // makes a next street worth solving — an all-in-call terminal already
      // has its final runout equity baked into this street's own CFR result,
      // and the river itself has no further street to deal.
      // A chance node is the same street change in a solve that looked ahead
      // to the river: the next street still gets its own full solve.
      if (
        (action.child.type === "terminal-showdown" || action.child.type === "chance") &&
        hasNextStreet(stage.board.length) &&
        stage.effectiveStackAtStart - action.child.committed.P1 > 0
      ) {
        next.push(idleStage(stage.board.length + 1, stage.effectiveStackAtStart - action.child.committed.P1));
      }

      return next;
    });
  }

  function handleResetStreet(stageIndex: number) {
    abortSolvesFrom(stageIndex);
    clearPreciseAvgFrom(stageIndex);
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
    clearPreciseAvgFrom(stageIndex);
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
      };
    } else {
      const prevStage = streets[stageIndex - 1];
      const terminal = prevStage.currentNode;
      if (prevStage.state.kind !== "done" || (terminal?.type !== "terminal-showdown" && terminal?.type !== "chance")) {
        throw new Error("handleBoardConfirm: the next street requires the previous street to end at a terminal-showdown or chance node");
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

  async function handleComputePreciseAverageEv(stageIndex: number) {
    const stage = streets[stageIndex];
    if (stage.state.kind !== "done" || stage.currentNode?.type !== "terminal-showdown") return;
    const terminal = stage.currentNode;

    const controller = new AbortController();
    preciseAbortRef.current = { stageIndex, controller };

    const cards = sampleNextCards(stage.board, DEFAULT_PRECISE_SAMPLE_COUNT);
    const heroNarrowed = narrowRangeAlongPath(stage.state.result.heroRange, "P1", stage.path);
    const villainNarrowed = narrowRangeAlongPath(stage.state.result.villainRange, "P2", stage.path);
    const samples: { card: string; heroEvBb: number; villainEvBb: number }[] = [];

    for (let i = 0; i < cards.length; i++) {
      setPreciseAvgByStage((prev) => ({ ...prev, [stageIndex]: { kind: "solving", sampleIndex: i, sampleCount: cards.length } }));
      const request: PostflopSolveRequest = {
        kind: "combos",
        board: [...stage.board, cards[i]],
        heroRange: heroNarrowed,
        villainRange: villainNarrowed,
        startPot: terminal.potBb,
        effectiveStackBb: stage.effectiveStackAtStart - terminal.committed.P1,
        maxIterations: DEFAULT_MAX_CFR_ITERATIONS,
        targetExploitabilityPercent: DEFAULT_TARGET_EXPLOITABILITY_PERCENT,
      };
      try {
        const result = await solvePostflopInWorker(request, { signal: controller.signal });
        if (!result.exploitability) throw new Error("missing exploitability on sample result");
        samples.push({
          card: cards[i],
          heroEvBb: result.exploitability.p1ActualBb,
          villainEvBb: result.exploitability.p2ActualBb,
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setPreciseAvgByStage((prev) => ({ ...prev, [stageIndex]: { kind: "idle" } }));
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        setPreciseAvgByStage((prev) => ({ ...prev, [stageIndex]: { kind: "error", message } }));
        return;
      }
    }

    const avgHeroEvBb = samples.reduce((s, x) => s + x.heroEvBb, 0) / samples.length;
    const avgVillainEvBb = samples.reduce((s, x) => s + x.villainEvBb, 0) / samples.length;
    setPreciseAvgByStage((prev) => ({ ...prev, [stageIndex]: { kind: "done", samples, avgHeroEvBb, avgVillainEvBb } }));
  }

  function handleCancelPreciseAverageEv() {
    preciseAbortRef.current?.controller.abort();
  }

  /**
   * The "done" state's content — identical whether it's the live current
   * street or an expanded past one, since a past stage is (by
   * PostflopPanel's own invariant: a next stage is only ever pushed once the
   * previous one reaches a terminal-showdown or chance node) always resolved
   * at one of those, never a decision node — so the 2-column grid branch
   * below simply never fires for past stages, no separate "past" variant needed.
   */
  function renderDoneContent(
    stage: StreetStage,
    i: number,
    solveState: Extract<SolveState, { kind: "done" }>,
    currentNode: SerializedTreeNode,
  ) {
    const isFlop = stage.streetLabel === "Flop";
    return (
      <>
        {solveState.result.exploitability && <ExploitabilityBadge exploitability={solveState.result.exploitability} />}
        {currentNode.type === "chance" && (
          <>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
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
        {(currentNode.type === "terminal-fold" || currentNode.type === "terminal-showdown") && (
          <PostflopTerminalMessage
            node={currentNode}
            heroLabel={props.heroLabel}
            villainLabel={props.villainLabel}
            showdownMessage={(potBb) => {
              const stackLeft = stage.effectiveStackAtStart - currentNode.committed.P1;
              if (currentNode.type === "terminal-showdown" && stackLeft <= 0) {
                return `All-in — hand is already decided, pot ${potBb.toFixed(1)}bb runs out to showdown automatically.`;
              }
              if (!hasNextStreet(stage.board.length)) {
                return `Showdown — pot ${potBb.toFixed(1)}bb. Hand complete.`;
              }
              const nextStreetLabel = streetLabelForBoardLength(stage.board.length + 1);
              return `Street ends — pot ${potBb.toFixed(1)}bb, ${nextStreetLabel.toLowerCase()} card coming next.`;
            }}
          />
        )}
        {currentNode.type === "terminal-showdown" && hasNextStreet(stage.board.length) && currentNode.checkdownEquity && (
          <>
            <CheckdownEquityNote
              equity={currentNode.checkdownEquity}
              heroLabel={props.heroLabel}
              villainLabel={props.villainLabel}
            />
            <AverageNextCardEv
              state={preciseAvgByStage[i] ?? { kind: "idle" }}
              heroLabel={props.heroLabel}
              villainLabel={props.villainLabel}
              sampleCount={DEFAULT_PRECISE_SAMPLE_COUNT}
              onCompute={() => handleComputePreciseAverageEv(i)}
              onCancel={handleCancelPreciseAverageEv}
            />
          </>
        )}
        {currentNode.type === "decision" &&
          (() => {
            const decisionNode = currentNode;
            const actionColors = buildActionColorScale(decisionNode.actions);
            const range = decisionNode.actor === "P1" ? solveState.result.heroRange : solveState.result.villainRange;
            return (
              <div className="grid flex-1 min-h-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="flex min-h-0 flex-col gap-2">
                  <BetSizeFilterBar
                    node={decisionNode}
                    range={range}
                    colors={actionColors}
                    isolatedActionIndex={isolatedActionIndex}
                    onIsolateChange={setIsolatedActionIndex}
                  />
                  <div className="min-h-0 flex-1">
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
                <div className="flex min-h-0 flex-col gap-3 overflow-y-auto border-l border-zinc-200 pl-4 dark:border-zinc-800">
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
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => handleResetStreet(i)}
            className="text-xs text-zinc-500 underline hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            Reset to start of street
          </button>
          <button
            type="button"
            onClick={() => handlePickDifferentBoard(i)}
            className="text-xs text-zinc-500 underline hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            {isFlop ? "Pick a different board" : `Pick a different ${stage.streetLabel.toLowerCase()} card`}
          </button>
        </div>
      </>
    );
  }

  /** Pot entering street `i` — the previous street's closing (terminal-showdown) pot, or the preflop pot for the flop. */
  function streetStartPot(i: number): number {
    return i === 0 ? props.startPot : (streets[i - 1].currentNode?.potBb ?? props.startPot);
  }

  const liveIndex = streets.length - 1;
  const live = streets[liveIndex];
  const liveIsFlop = live.streetLabel === "Flop";

  function renderPastStreetDetails(i: number) {
    const stage = streets[i];
    // Invariant: a stage is only ever non-last once its own action reached a
    // terminal-showdown or chance node (see handleNavigate) — so a past stage is always done.
    if (stage.state.kind !== "done" || !stage.currentNode) return null;
    return (
      <div
        data-testid="past-street-details"
        className="absolute inset-x-4 top-4 z-10 flex max-h-[80%] flex-col gap-2 overflow-y-auto rounded-lg border border-zinc-300 bg-white p-4 shadow-xl dark:border-zinc-700 dark:bg-zinc-950"
      >
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
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
            className="ml-auto rounded px-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
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
    <div className="relative flex flex-1 min-h-0 flex-col gap-2 overflow-hidden rounded-lg border border-zinc-300 p-4 dark:border-zinc-700">
      {props.streetBarSlot && createPortal(timeline, props.streetBarSlot)}

      <h2 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
        Postflop solver ({props.heroLabel} vs {props.villainLabel}) — Phase 1, experimental
      </h2>

      <div
        data-testid="street-stage"
        data-street={live.streetLabel}
        className="flex flex-1 min-h-0 flex-col gap-2 overflow-y-auto"
      >
        {live.state.kind === "idle" && (
          <BoardPicker
            count={liveIsFlop ? 3 : 1}
            excludedCards={liveIndex === 0 ? [] : streets[liveIndex - 1].board}
            title={liveIsFlop ? "Pick the 3 flop cards" : `Pick the ${live.streetLabel.toLowerCase()} card`}
            confirmLabel={`Solve ${live.streetLabel.toLowerCase()}`}
            onConfirm={(cards) => handleBoardConfirm(liveIndex, cards)}
          />
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
            <p className="text-sm text-red-600 dark:text-red-400">Error: {live.state.message}</p>
            <div>
              <button
                type="button"
                onClick={() => handlePickDifferentBoard(liveIndex)}
                className="text-xs text-zinc-500 underline hover:text-zinc-900 dark:hover:text-zinc-100"
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
