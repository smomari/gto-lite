import createSolverModule from "./solver.web.mjs";
import createThreadedSolverModule from "./solver.web-threads.mjs";
import type { SolverModule } from "./solverModule";

/** Threads for one solve, the calling worker included: every core but the page's, at most 9. */
const MAX_THREADS = 9;

export interface WebSolver {
  solver: SolverModule;
  /** Threads eng_set_threads may use (1 when the page can't share memory). */
  threads: number;
}

let loading: Promise<WebSolver | null> | undefined;

/**
 * The C++ solver core for browser workers, loaded once per worker. On a
 * cross-origin isolated page (COOP/COEP, next.config.ts) it's the threaded
 * build, its pool workers started up front; otherwise the one-thread build.
 * Resolves to null when the browser can't run it — the module needs
 * WebAssembly SIMD (Chrome 91+, Firefox 89+, Safari 16.4+) — so callers fall
 * back to the TypeScript engine.
 */
export function loadWebSolverModule(): Promise<WebSolver | null> {
  loading ??= load().catch((err: unknown) => {
    console.warn("WASM solver core unavailable, using the TypeScript engine:", err);
    return null;
  });
  return loading;
}

async function load(): Promise<WebSolver> {
  const threads = typeof SharedArrayBuffer !== "undefined" && globalThis.crossOriginIsolated
    ? Math.max(1, Math.min((navigator.hardwareConcurrency || 4) - 1, MAX_THREADS))
    : 1;
  if (threads === 1) return { solver: await createSolverModule(), threads };
  const solver = await createThreadedSolverModule({
    pthreadPoolSize: threads - 1,
    createPthreadWorker: () => new Worker(new URL("./pthreadEntry.ts", import.meta.url), { type: "module", name: "em-pthread" }),
  });
  return { solver, threads };
}
