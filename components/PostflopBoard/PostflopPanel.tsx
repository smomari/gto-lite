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

/**
 * One street's worth of state: board picking, solving, and tree navigation.
 * Kept as an array (rather than separate flop/turn fields) so a future river
 * stage slots in without restructuring — flop and turn already share every
 * bit of this shape and rendering logic.
 */
interface StreetStage {
  streetLabel: "Flop" | "Turn";
  /** Cumulative board through this stage (3 cards for the flop, 4 for the turn). */
  board: string[];
  state: SolveState;
  currentNode: SerializedTreeNode | null;
  path: TreePathStep[];
}

const ITERATIONS = 1000;

function idleFlopStage(): StreetStage {
  return { streetLabel: "Flop", board: [], state: { kind: "idle" }, currentNode: null, path: [] };
}

function idleTurnStage(): StreetStage {
  return { streetLabel: "Turn", board: [], state: { kind: "idle" }, currentNode: null, path: [] };
}

export function PostflopPanel(props: PostflopPanelProps) {
  const [streets, setStreets] = useState<StreetStage[]>([idleFlopStage()]);

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

      // Only the flop hands off to a turn stage — a live stack still behind
      // is what makes a turn worth solving; an all-in-call terminal already
      // has its final (2-card-runout) equity baked into the flop's own CFR
      // result, so there's nothing left to solve.
      if (
        stageIndex === 0 &&
        action.child.type === "terminal-showdown" &&
        props.effectiveStackBb - action.child.committed.P1 > 0
      ) {
        next.push(idleTurnStage());
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
      const flop = streets[0];
      if (flop.state.kind !== "done" || flop.currentNode?.type !== "terminal-showdown") {
        throw new Error("handleBoardConfirm: the turn requires the flop to be at a terminal-showdown");
      }
      const terminal: SerializedTerminalNode = flop.currentNode;
      request = {
        kind: "combos",
        board: fullBoard,
        heroRange: narrowRangeAlongPath(flop.state.result.heroRange, "P1", flop.path),
        villainRange: narrowRangeAlongPath(flop.state.result.villainRange, "P2", flop.path),
        startPot: terminal.potBb,
        effectiveStackBb: props.effectiveStackBb - terminal.committed.P1,
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
                count={i === 0 ? 3 : 1}
                excludedCards={i === 0 ? [] : streets[i - 1].board}
                title={i === 0 ? "Pick the 3 flop cards" : "Pick the turn card"}
                confirmLabel={i === 0 ? "Solve flop" : "Solve turn"}
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
                    if (i > 0) {
                      return `Turn ends — pot ${potBb.toFixed(1)}bb. River solving isn't implemented yet.`;
                    }
                    const committed = currentNode.type === "terminal-showdown" ? currentNode.committed : null;
                    const stackLeft = committed ? props.effectiveStackBb - committed.P1 : null;
                    if (stackLeft !== null && stackLeft <= 0) {
                      return `All-in — hand is already decided, pot ${potBb.toFixed(1)}bb runs out to showdown automatically.`;
                    }
                    return `Street ends — pot ${potBb.toFixed(1)}bb, turn card coming next.`;
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
                    {i === 0 ? "Pick a different board" : "Pick a different turn card"}
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
