/// <reference lib="webworker" />
import type {
  ActionWeightKey,
  PostflopSolveInMessage,
  PostflopWorkerOutMessage,
} from "@/types/postflopSolver";
import type { HandFrequency } from "@/types/rangeData";
import { solvePostflopStreet, type PostflopSolveInput } from "../solvePostflop";
import { serializeCombos, serializeTree } from "../serialize";

// Runs entirely client-side in a Worker: no Node `fs`, no equity-matrix file,
// nothing from lib/equity/loadEquityMatrix.ts — only the pure postflop CFR
// engine (which needs phe, a plain-JS lookup-table evaluator, not the 124MB
// Node-only poker-evaluator table the preflop /api/solve route uses).

function actionWeight(key: ActionWeightKey): (hf: HandFrequency) => number {
  return (hf) => hf[key] ?? 0;
}

self.onmessage = (event: MessageEvent<PostflopSolveInMessage>) => {
  const { request } = event.data;

  try {
    const solveInput: PostflopSolveInput =
      request.kind === "canonical"
        ? {
            kind: "canonical",
            board: request.board,
            heroHandFrequencies: request.heroHandFrequencies,
            heroActionWeight: actionWeight(request.heroActionKey),
            villainHandFrequencies: request.villainHandFrequencies,
            villainActionWeight: actionWeight(request.villainActionKey),
            startPot: request.startPot,
            effectiveStackBb: request.effectiveStackBb,
            iterations: request.iterations,
          }
        : {
            kind: "combos",
            board: request.board,
            heroRange: request.heroRange,
            villainRange: request.villainRange,
            startPot: request.startPot,
            effectiveStackBb: request.effectiveStackBb,
            iterations: request.iterations,
          };

    const result = solvePostflopStreet(
      solveInput,
      (phase, done, total) => {
        const progress: PostflopWorkerOutMessage = { type: "progress", phase, done, total };
        self.postMessage(progress);
      },
    );

    const message: PostflopWorkerOutMessage = {
      type: "result",
      tree: serializeTree(result.tree, result.solution),
      heroRange: serializeCombos(result.heroRange),
      villainRange: serializeCombos(result.villainRange),
      iterations: result.solution.iterations,
    };
    self.postMessage(message);
  } catch (err) {
    const message: PostflopWorkerOutMessage = {
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(message);
  }
};
