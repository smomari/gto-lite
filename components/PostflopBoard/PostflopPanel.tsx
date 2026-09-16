"use client";

import { useRef, useState } from "react";
import { BoardPicker } from "./BoardPicker";
import { CardChip } from "./CardChip";
import { PostflopActionBar } from "./PostflopActionBar";
import { PostflopRangeGrid } from "@/components/PostflopStrategy/PostflopRangeGrid";
import { SolveProgress } from "@/components/PostflopStrategy/SolveProgress";
import { ExploitabilityBadge } from "@/components/PostflopStrategy/ExploitabilityBadge";
import { CheckdownEquityNote } from "./CheckdownEquityNote";
import { AverageNextCardEv, type PreciseAvgState } from "./AverageNextCardEv";
import { solvePostflopInWorker } from "@/lib/postflopSolver/worker/workerClient";
import { narrowRangeAlongPath, type TreePathStep } from "@/lib/postflopSolver/rangeNarrowing";
import { DEFAULT_MAX_CFR_ITERATIONS, DEFAULT_TARGET_EXPLOITABILITY_PERCENT } from "@/lib/postflopSolver/cfr";
import { DEFAULT_PRECISE_SAMPLE_COUNT, sampleNextCards } from "@/lib/postflopSolver/nextCardSampling";
import type {
  ActionWeightKey,
  PostflopResultMessage,
  PostflopSolveRequest,
  SerializedDecisionAction,
  SerializedTerminalNode,
  SerializedTreeNode,
} from "@/types/postflopSolver";
import type { HandFrequency } from "@/types/rangeData";

interface PostflopPanelProps {
  heroLabel: string;
  heroHands: HandFrequency[];
  heroActionKey: ActionWeightKey;
  villainLabel: string;
  villainHands: HandFrequency[];
  villainActionKey: ActionWeightKey;
  startPot: number;
  effectiveStackBb: number;
}

type SolveState =
  | { kind: "idle" }
  | { kind: "solving"; phase: "equity" | "cfr"; done: number; total: number; exploitabilityPercent?: number }
  | { kind: "done"; result: PostflopResultMessage }
  | { kind: "error"; message: string };

type StreetLabel = "Flop" | "Turn" | "River";

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

function streetLabelForBoardLength(boardLength: number): StreetLabel {
  if (boardLength === 3) return "Flop";
  if (boardLength === 4) return "Turn";
  if (boardLength === 5) return "River";
  throw new Error(`streetLabelForBoardLength: unexpected board length ${boardLength}`);
}

/** The river (5-card board) is the last street — nothing more to deal after it. */
function hasNextStreet(boardLength: number): boolean {
  return boardLength < 5;
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
  const preciseAbortRef = useRef<AbortController | null>(null);

  function clearPreciseAvgFrom(stageIndex: number) {
    setPreciseAvgByStage((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (Number(key) >= stageIndex) delete next[Number(key)];
      }
      return next;
    });
  }

  function handleNavigate(stageIndex: number, action: SerializedDecisionAction) {
    clearPreciseAvgFrom(stageIndex);
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
      if (
        action.child.type === "terminal-showdown" &&
        hasNextStreet(stage.board.length) &&
        stage.effectiveStackAtStart - action.child.committed.P1 > 0
      ) {
        next.push(idleStage(stage.board.length + 1, stage.effectiveStackAtStart - action.child.committed.P1));
      }

      return next;
    });
  }

  function handleResetStreet(stageIndex: number) {
    clearPreciseAvgFrom(stageIndex);
    setStreets((prev) => {
      const stage = prev[stageIndex];
      if (stage.state.kind !== "done") return prev;
      return [...prev.slice(0, stageIndex), { ...stage, currentNode: stage.state.result.tree, path: [] }];
    });
  }

  function handlePickDifferentBoard(stageIndex: number) {
    clearPreciseAvgFrom(stageIndex);
    setStreets((prev) => [
      ...prev.slice(0, stageIndex),
      { ...prev[stageIndex], board: [], state: { kind: "idle" }, currentNode: null, path: [] },
    ]);
  }

  function handleBoardConfirm(stageIndex: number, cards: string[]) {
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
      if (prevStage.state.kind !== "done" || prevStage.currentNode?.type !== "terminal-showdown") {
        throw new Error("handleBoardConfirm: the next street requires the previous street to be at a terminal-showdown");
      }
      const terminal: SerializedTerminalNode = prevStage.currentNode;
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

    solvePostflopInWorker(request, {
      onProgress: (phase, done, total, exploitabilityPercent) =>
        setStreets((prev) => {
          const next = [...prev];
          next[stageIndex] = { ...next[stageIndex], state: { kind: "solving", phase, done, total, exploitabilityPercent } };
          return next;
        }),
    })
      .then((result) => {
        setStreets((prev) => {
          const next = [...prev];
          next[stageIndex] = { ...next[stageIndex], state: { kind: "done", result }, currentNode: result.tree };
          return next;
        });
      })
      .catch((err) => {
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
    preciseAbortRef.current = controller;

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
    preciseAbortRef.current?.abort();
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-zinc-300 p-4 dark:border-zinc-700">
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        Postflop solver ({props.heroLabel} vs {props.villainLabel}) — Phase 1, experimental
      </h2>

      {streets.map((stage, i) => {
        const solveState = stage.state;
        const currentNode = stage.currentNode;
        const isFlop = stage.streetLabel === "Flop";

        return (
          <div
            key={i}
            data-testid="street-stage"
            data-street={stage.streetLabel}
            className="flex flex-col gap-3 border-t border-zinc-200 pt-3 first:border-t-0 first:pt-0 dark:border-zinc-800"
          >
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {stage.streetLabel}
              </h3>
              {solveState.kind !== "idle" && (
                <div className="flex gap-1">
                  {stage.board.map((card) => (
                    <CardChip key={card} card={card} size="md" />
                  ))}
                </div>
              )}
            </div>

            {solveState.kind === "idle" && (
              <BoardPicker
                count={isFlop ? 3 : 1}
                excludedCards={i === 0 ? [] : streets[i - 1].board}
                title={isFlop ? "Pick the 3 flop cards" : `Pick the ${stage.streetLabel.toLowerCase()} card`}
                confirmLabel={`Solve ${stage.streetLabel.toLowerCase()}`}
                onConfirm={(cards) => handleBoardConfirm(i, cards)}
              />
            )}

            {solveState.kind === "solving" && (
              <SolveProgress
                phase={solveState.phase}
                done={solveState.done}
                total={solveState.total}
                exploitabilityPercent={solveState.exploitabilityPercent}
                targetExploitabilityPercent={DEFAULT_TARGET_EXPLOITABILITY_PERCENT}
              />
            )}

            {solveState.kind === "error" && (
              <p className="text-sm text-red-600 dark:text-red-400">Error: {solveState.message}</p>
            )}

            {solveState.kind === "done" && currentNode && (
              <>
                {solveState.result.exploitability && (
                  <ExploitabilityBadge exploitability={solveState.result.exploitability} />
                )}
                <PostflopActionBar
                  node={currentNode}
                  history={stage.path.map((step) => ({
                    actor: step.node.actor,
                    label: step.node.actions[step.actionIndex].label,
                  }))}
                  heroLabel={props.heroLabel}
                  villainLabel={props.villainLabel}
                  onNavigate={(action) => handleNavigate(i, action)}
                  terminalShowdownMessage={(potBb) => {
                    const committed = currentNode.type === "terminal-showdown" ? currentNode.committed : null;
                    const stackLeft = committed ? stage.effectiveStackAtStart - committed.P1 : null;

                    if (stackLeft !== null && stackLeft <= 0) {
                      return `All-in — hand is already decided, pot ${potBb.toFixed(1)}bb runs out to showdown automatically.`;
                    }
                    if (!hasNextStreet(stage.board.length)) {
                      return `Showdown — pot ${potBb.toFixed(1)}bb. Hand complete.`;
                    }
                    const nextStreetLabel = streetLabelForBoardLength(stage.board.length + 1);
                    return `Street ends — pot ${potBb.toFixed(1)}bb, ${nextStreetLabel.toLowerCase()} card coming next.`;
                  }}
                />
                {currentNode.type === "terminal-showdown" &&
                  hasNextStreet(stage.board.length) &&
                  currentNode.checkdownEquity && (
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
                {currentNode.type === "decision" && (
                  <PostflopRangeGrid
                    range={currentNode.actor === "P1" ? solveState.result.heroRange : solveState.result.villainRange}
                    node={currentNode}
                  />
                )}
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
            )}
          </div>
        );
      })}
    </div>
  );
}
