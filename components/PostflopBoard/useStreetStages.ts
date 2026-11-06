"use client";

import { useEffect, useRef, useState } from "react";
import { solvePostflopInWorker } from "@/lib/postflopSolver/worker/workerClient";
import type { SerializedDecisionAction } from "@/types/postflopSolver";
import { buildStreetSolveRequest, idleStage, type StreetSolveInputs, type StreetStage } from "./streetStages";

/**
 * The hand's streets and the solves behind them. In-flight solves write back
 * by stage index, so every action that truncates or reuses a stage cancels
 * the solves from that stage on first.
 */
export function useStreetStages(inputs: StreetSolveInputs) {
  const [streets, setStreets] = useState<StreetStage[]>(() => [idleStage(3, inputs.effectiveStackBb)]);
  const solveAbortRef = useRef(new Map<number, AbortController>());

  useEffect(() => {
    const solves = solveAbortRef.current;
    return () => {
      for (const controller of solves.values()) controller.abort();
      solves.clear();
    };
  }, []);

  function abortSolvesFrom(stageIndex: number) {
    for (const [index, controller] of solveAbortRef.current) {
      if (index >= stageIndex) {
        controller.abort();
        solveAbortRef.current.delete(index);
      }
    }
  }

  function updateStage(stageIndex: number, update: (stage: StreetStage) => StreetStage) {
    setStreets((prev) => prev.map((stage, i) => (i === stageIndex ? update(stage) : stage)));
  }

  function navigate(stageIndex: number, action: SerializedDecisionAction) {
    abortSolvesFrom(stageIndex);
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

  function resetStreet(stageIndex: number) {
    abortSolvesFrom(stageIndex);
    setStreets((prev) => {
      const stage = prev[stageIndex];
      if (stage.state.kind !== "done") return prev;
      return [...prev.slice(0, stageIndex), { ...stage, currentNode: stage.state.result.tree, path: [] }];
    });
  }

  function pickDifferentBoard(stageIndex: number) {
    abortSolvesFrom(stageIndex);
    setStreets((prev) => [
      ...prev.slice(0, stageIndex),
      { ...prev[stageIndex], board: [], state: { kind: "idle" }, currentNode: null, path: [] },
    ]);
  }

  function confirmBoard(stageIndex: number, cards: string[], fastFlop: boolean) {
    const request = buildStreetSolveRequest(streets, stageIndex, cards, inputs, fastFlop);
    updateStage(stageIndex, (stage) => ({
      ...stage,
      board: request.board,
      state: { kind: "solving", phase: "equity", done: 0, total: 1 },
      currentNode: null,
      path: [],
    }));

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
        updateStage(stageIndex, (stage) => ({ ...stage, state: { kind: "solving", phase, done, total, exploitabilityPercent } }));
      },
    })
      .then((result) => {
        if (controller.signal.aborted) return;
        finish();
        updateStage(stageIndex, (stage) => ({ ...stage, state: { kind: "done", result }, currentNode: result.tree }));
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        finish();
        const message = err instanceof Error ? err.message : String(err);
        updateStage(stageIndex, (stage) => ({ ...stage, state: { kind: "error", message } }));
      });
  }

  return { streets, navigate, resetStreet, pickDifferentBoard, confirmBoard };
}
