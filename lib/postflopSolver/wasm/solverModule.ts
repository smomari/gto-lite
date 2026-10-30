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
  HEAPU32: Uint32Array;
  HEAPF32: Float32Array;
  HEAPF64: Float64Array;

  _malloc(bytes: number): number;
  _free(ptr: number): void;

  /** CFR engine (native/solver/engine.cpp) — see engine.ts for the argument layout. */
  _eng_create(
    nodeCount: number,
    type: number,
    childStart: number,
    childCount: number,
    pot: number,
    committed1: number,
    committed2: number,
    aux: number,
    childSlots: number,
    children: number,
    childCard: number,
    childWeight: number,
    heroCount: number,
    heroCards: number,
    heroWeights: number,
    villainCount: number,
    villainCards: number,
    villainWeights: number,
  ): number;
  _eng_destroy(engine: number): void;
  _eng_add_equity_table(engine: number, heroEquity: number): number;
  _eng_add_river_board(engine: number, heroStrength: number, villainStrength: number): number;
  _eng_iterate(engine: number, firstT: number, count: number): void;
  _eng_exploitability(engine: number, out: number): void;
  _eng_average_strategy(engine: number, node: number, out: number): void;
}

export type CreateSolverModule = () => Promise<SolverModule>;
