import createSolverModule from "./solver.node.mjs";
import type { SolverModule } from "./solverModule";

let loading: Promise<SolverModule> | undefined;

/** The C++ solver core under Node (vitest, scripts/bench-postflop.ts), loaded once per process. */
export function loadNodeSolverModule(): Promise<SolverModule> {
  loading ??= createSolverModule();
  return loading;
}
