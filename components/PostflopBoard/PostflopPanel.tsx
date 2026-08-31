"use client";

import { useState } from "react";
import { BoardPicker } from "./BoardPicker";
import { PostflopActionBar } from "./PostflopActionBar";
import { ComboRangeGrid } from "@/components/PostflopStrategy/ComboRangeGrid";
import { SolveProgress } from "@/components/PostflopStrategy/SolveProgress";
import { solvePostflopInWorker } from "@/lib/postflopSolver/worker/workerClient";
import type { ActionWeightKey, PostflopResultMessage, SerializedTreeNode } from "@/types/postflopSolver";
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

const ITERATIONS = 1000;

export function PostflopPanel(props: PostflopPanelProps) {
  const [state, setState] = useState<SolveState>({ kind: "idle" });
  const [currentNode, setCurrentNode] = useState<SerializedTreeNode | null>(null);

  function handleBoardConfirm(board: string[]) {
    setState({ kind: "solving", phase: "equity", done: 0, total: 1 });
    setCurrentNode(null);

    solvePostflopInWorker(
      {
        board,
        heroHandFrequencies: props.heroHands,
        heroActionKey: props.heroActionKey,
        villainHandFrequencies: props.villainHands,
        villainActionKey: props.villainActionKey,
        startPot: props.startPot,
        effectiveStackBb: props.effectiveStackBb,
        iterations: ITERATIONS,
      },
      { onProgress: (phase, done, total) => setState({ kind: "solving", phase, done, total }) },
    )
      .then((result) => {
        setState({ kind: "done", result });
        setCurrentNode(result.tree);
      })
      .catch((err) => setState({ kind: "error", message: err instanceof Error ? err.message : String(err) }));
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-zinc-300 p-4 dark:border-zinc-700">
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        Flop solver ({props.heroLabel} vs {props.villainLabel}) — Phase 1, experimental
      </h2>

      {state.kind === "idle" && <BoardPicker onConfirm={handleBoardConfirm} />}

      {state.kind === "solving" && <SolveProgress phase={state.phase} done={state.done} total={state.total} />}

      {state.kind === "error" && (
        <p className="text-sm text-red-600 dark:text-red-400">Error: {state.message}</p>
      )}

      {state.kind === "done" && currentNode && (
        <div className="flex flex-col gap-3">
          <PostflopActionBar node={currentNode} onNavigate={setCurrentNode} />
          {currentNode.type === "decision" && (
            <ComboRangeGrid
              range={currentNode.actor === "P1" ? state.result.heroRange : state.result.villainRange}
              node={currentNode}
            />
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setCurrentNode(state.result.tree)}
              className="text-xs text-zinc-500 underline hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              Reset to start of street
            </button>
            <button
              type="button"
              onClick={() => setState({ kind: "idle" })}
              className="text-xs text-zinc-500 underline hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              Pick a different board
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
