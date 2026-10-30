import createSolverModule from "./solver.web.mjs";
import type { SolverModule } from "./solverModule";

let loading: Promise<SolverModule | null> | undefined;

/**
 * The C++ solver core for browser workers, loaded once per worker. Resolves to
 * null when the browser can't run it — the module needs WebAssembly SIMD
 * (Chrome 91+, Firefox 89+, Safari 16.4+), and compiling it elsewhere throws —
 * so callers fall back to the TypeScript kernels.
 */
export function loadWebSolverModule(): Promise<SolverModule | null> {
  loading ??= createSolverModule().catch((err: unknown) => {
    console.warn("WASM solver core unavailable, using the TypeScript kernels:", err);
    return null;
  });
  return loading;
}
