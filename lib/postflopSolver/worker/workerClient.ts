import type {
  PostflopResultMessage,
  PostflopSolveInMessage,
  PostflopSolveRequest,
  PostflopWorkerOutMessage,
} from "@/types/postflopSolver";

export interface SolvePostflopOptions {
  onProgress?: (phase: "equity" | "cfr", done: number, total: number) => void;
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
    let settled = false;

    function cleanup() {
      worker.terminate();
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
        options?.onProgress?.(msg.phase, msg.done, msg.total);
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
    worker.postMessage(inMessage);
  });
}
