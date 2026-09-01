"use client";

import { useState } from "react";
import { BoardPicker } from "./BoardPicker";
import { PostflopActionBar } from "./PostflopActionBar";
import { PostflopRangeGrid } from "@/components/PostflopStrategy/PostflopRangeGrid";
import { SolveProgress } from "@/components/PostflopStrategy/SolveProgress";
import { solvePostflopInWorker } from "@/lib/postflopSolver/worker/workerClient";
import { narrowRangeAlongPath, type TreePathStep } from "@/lib/postflopSolver/rangeNarrowing";
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
  | { kind: "solving"; phase: "equity" | "cfr"; done: number; total: number }
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

const ITERATIONS = 1000;

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

  function handleNavigate(stageIndex: number, action: SerializedDecisionAction) {
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
    setStreets((prev) => {
      const stage = prev[stageIndex];
      if (stage.state.kind !== "done") return prev;
      return [...prev.slice(0, stageIndex), { ...stage, currentNode: stage.state.result.tree, path: [] }];
    });
  }

  function handlePickDifferentBoard(stageIndex: number) {
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
        iterations: ITERATIONS,
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
        iterations: ITERATIONS,
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
      onProgress: (phase, done, total) =>
        setStreets((prev) => {
          const next = [...prev];
          next[stageIndex] = { ...next[stageIndex], state: { kind: "solving", phase, done, total } };
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
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {stage.streetLabel}
            </h3>

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
              <SolveProgress phase={solveState.phase} done={solveState.done} total={solveState.total} />
            )}

            {solveState.kind === "error" && (
              <p className="text-sm text-red-600 dark:text-red-400">Error: {solveState.message}</p>
            )}

            {solveState.kind === "done" && currentNode && (
              <>
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
