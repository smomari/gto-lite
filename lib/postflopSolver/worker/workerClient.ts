import type {
  PostflopResultMessage,
  PostflopSolveInMessage,
  PostflopSolvePhase,
  PostflopSolveRequest,
  PostflopWorkerOutMessage,
} from "@/types/postflopSolver";
import { supportsWasmSimd } from "../wasm/simdSupport";

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
    const helpers = startHelpers();
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

/** Capped at cores − 2: one for the page, one for the solver worker, which also computes a share. */
const MAX_HELPERS = 8;

/**
 * Showdown helpers (parallelShowdown.ts) for the TypeScript engine, the
 * fallback without WASM SIMD: workers wired to the solver worker by
 * MessageChannel ports. They share memory with it (SharedArrayBuffer), which
 * browsers only allow on a cross-origin isolated page (COOP/COEP headers in
 * next.config.ts), and are started here on the main thread rather than inside
 * the solver worker. The C++ engine starts its own threads (wasm/loadWeb.ts).
 */
function startHelpers(): { workers: Worker[]; solverPorts: MessagePort[] } {
  const none = { workers: [], solverPorts: [] };
  if (typeof SharedArrayBuffer === "undefined" || !globalThis.crossOriginIsolated || supportsWasmSimd()) return none;
  const count = Math.max(0, Math.min((navigator.hardwareConcurrency || 4) - 2, MAX_HELPERS));
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
