/**
 * The C++ solver core (native/solver/), compiled by native/build-wasm.sh into
 * two single-file ES modules next to this file: `solver.web.mjs` (browser
 * workers, loaded via loadWeb.ts) and `solver.node.mjs` (vitest and scripts,
 * via loadNode.ts). Both expose this same instance shape. Pointers are byte
 * offsets into the module's memory; HEAP views must be re-read after any call
 * that may allocate, since memory growth replaces the underlying buffer.
 */
export interface SolverModule {
  HEAPU8: Uint8Array;
  HEAP32: Int32Array;
  HEAPF32: Float32Array;
  HEAPF64: Float64Array;

  /** Showdown batch context (native/solver/showdown.cpp). `side`: 0 = hero rows, 1 = villain rows. */
  _sd_create(heroRows: number, villainRows: number, nodeCount: number): number;
  _sd_destroy(ctx: number): void;
  _sd_equity(ctx: number, side: number): number;
  _sd_row_cards(ctx: number, side: number): number;
  _sd_col_cards(ctx: number, side: number): number;
  _sd_row_same_col(ctx: number, side: number): number;
  _sd_opponent_reach(ctx: number, side: number): number;
  _sd_out(ctx: number, side: number): number;
  _sd_evaluate(ctx: number): void;
}

export type CreateSolverModule = () => Promise<SolverModule>;
