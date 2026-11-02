/// <reference lib="webworker" />
import type { ActionWeightKey, PostflopSolveInMessage, PostflopWorkerOutMessage } from "@/types/postflopSolver";
import type { HandFrequency } from "@/types/rangeData";
import { solvePostflopStreet, type PostflopSolveInput } from "../solvePostflop";
import { serializeCombos, serializeTree } from "../serialize";
import { computeCheckdownEquities } from "../checkdownEquity";
import { loadWebSolverModule } from "../wasm/loadWeb";

// Runs entirely client-side in a Worker: no Node `fs`, no equity-matrix file,
// nothing from lib/equity/loadEquityMatrix.ts — only the C++ solver core, and
// phe, a plain-JS lookup-table evaluator, for the hand strengths it's given.

function actionWeight(key: ActionWeightKey): (hf: HandFrequency) => number {
  return (hf) => hf[key] ?? 0;
}

self.onmessage = async (event: MessageEvent<PostflopSolveInMessage>) => {
  const { request } = event.data;
  try {
    const engine = await loadWebSolverModule();

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
            maxIterations: request.maxIterations,
            targetExploitabilityPercent: request.targetExploitabilityPercent,
            fast: request.fast,
            rake: request.rake,
          }
        : {
            kind: "combos",
            board: request.board,
            heroRange: request.heroRange,
            villainRange: request.villainRange,
            startPot: request.startPot,
            effectiveStackBb: request.effectiveStackBb,
            maxIterations: request.maxIterations,
            targetExploitabilityPercent: request.targetExploitabilityPercent,
            rake: request.rake,
          };

    const result = solvePostflopStreet(
      solveInput,
      engine,
      (phase, done, total, exploitabilityPercent) => {
        const progress: PostflopWorkerOutMessage = { type: "progress", phase, done, total, exploitabilityPercent };
        self.postMessage(progress);
      },
    );

    const checkdown = computeCheckdownEquities(
      result.tree,
      result.solution,
      result.heroRange,
      result.villainRange,
      result.equityTable,
      request.rake,
    );
    // A lookahead solve (flop, turn): its EV at each street change, read while the engine is still alive.
    const nextStreetEv = result.session?.nextStreetEv();
    const tree = serializeTree(result.tree, result.solution, checkdown, nextStreetEv);
    result.session?.dispose();

    const message: PostflopWorkerOutMessage = {
      type: "result",
      tree,
      heroRange: serializeCombos(result.heroRange),
      villainRange: serializeCombos(result.villainRange),
      iterations: result.solution.iterations,
      exploitability: result.exploitability,
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
