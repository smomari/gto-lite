import createSolverModule from "./solver.node.mjs";
import type { SolverModule } from "./solverModule";

let loading: Promise<SolverModule> | undefined;
const threaded = new Map<number, Promise<SolverModule>>();

/** The C++ solver core under Node (vitest, scripts/bench-postflop.ts), loaded once per process. */
export function loadNodeSolverModule(): Promise<SolverModule> {
  loading ??= createSolverModule();
  return loading;
}

/** The threaded build under Node with a pool for `threads` threads (the caller included), loaded once per size. */
export function loadNodeThreadedSolverModule(threads: number): Promise<SolverModule> {
  let solver = threaded.get(threads);
  if (!solver) {
    // Imported on demand: its top-level await doesn't load under tsx (scripts/bench-postflop.ts), which compiles to CommonJS.
    solver = import("./solver.node-threads.mjs").then(({ default: create }) => create({ pthreadPoolSize: threads - 1 }));
    threaded.set(threads, solver);
  }
  return solver;
}
