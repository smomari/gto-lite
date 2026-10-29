import type {
  PostflopResultMessage,
  PostflopSolveInMessage,
  PostflopSolvePhase,
  PostflopSolveRequest,
  PostflopWorkerOutMessage,
} from "@/types/postflopSolver";

export interface SolvePostflopOptions {
  onProgress?: (phase: PostflopSolvePhase, done: number, total: number, exploitabilityPercent?: number) => void;
  signal?: AbortSignal;
}

/**
 * Main-thread wrapper around the postflop Worker — mirrors lib/apiClient/
 * solveClient.ts's promise + AbortSignal shape, but there is no server round
 * trip here: everything runs client-side in the Worker (see postflopWorker.ts
 * for why — no Node `fs`/equity-matrix file involved, only `phe`).
 */
export function solvePostflopInWorker(
  request: PostflopSolveRequest,
  options?: SolvePostflopOptions,
): Promise<PostflopResultMessage> {
  return new Promise((resolve, reject) => {
    if (options?.signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const worker = new Worker(new URL("./postflopWorker.ts", import.meta.url));
    const helpers = startShowdownHelpers();
    let settled = false;

    function cleanup() {
      worker.terminate();
      for (const helper of helpers.workers) helper.terminate();
      options?.signal?.removeEventListener("abort", onAbort);
    }

    function onAbort() {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    }

    options?.signal?.addEventListener("abort", onAbort);

    worker.onmessage = (event: MessageEvent<PostflopWorkerOutMessage>) => {
      const msg = event.data;
      if (msg.type === "progress") {
        options?.onProgress?.(msg.phase, msg.done, msg.total, msg.exploitabilityPercent);
        return;
      }
      if (settled) return;
      settled = true;
      if (msg.type === "result") {
        cleanup();
        resolve(msg);
      } else {
        cleanup();
        reject(new Error(msg.message));
      }
    };

    worker.onerror = (event: ErrorEvent) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(event.message || "Postflop worker error"));
    };

    const inMessage: PostflopSolveInMessage = { type: "solve", request };
    worker.postMessage(inMessage, helpers.solverPorts);
  });
}

/** Leaves one core for the page and one for the solver worker itself, which also computes a slice. */
const MAX_SHOWDOWN_HELPERS = 5;

/**
 * Helper workers that share the showdown batch with the solver worker. They
 * need SharedArrayBuffer, which browsers only allow on a cross-origin isolated
 * page (COOP/COEP headers in next.config.ts) — otherwise none, and the solver
 * runs on its own thread as before. Started here on the main thread (not from
 * inside the solver worker) and wired to it by MessageChannel.
 */
function startShowdownHelpers(): { workers: Worker[]; solverPorts: MessagePort[] } {
  if (typeof SharedArrayBuffer === "undefined" || !globalThis.crossOriginIsolated) return { workers: [], solverPorts: [] };
  const count = Math.max(0, Math.min((navigator.hardwareConcurrency || 4) - 2, MAX_SHOWDOWN_HELPERS));
  const workers: Worker[] = [];
  const solverPorts: MessagePort[] = [];
  for (let i = 0; i < count; i++) {
    const helper = new Worker(new URL("./showdownHelperWorker.ts", import.meta.url));
    const channel = new MessageChannel();
    helper.postMessage(null, [channel.port1]);
    workers.push(helper);
    solverPorts.push(channel.port2);
  }
  return { workers, solverPorts };
}
