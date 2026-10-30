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
  HEAPU16: Uint16Array;
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
  _eng_node_ev(engine: number, node: number, reach1: number, reach2: number, out: number): void;
  _eng_average_strategy(engine: number, node: number, out: number): void;

  /** Split solves: eng_partition, then a pthread pool working through the leaves (threaded builds; one thread otherwise). */
  _eng_partition(engine: number, leafCount: number, leafNodes: number): void;
  _eng_set_threads(engine: number, threads: number): number;
  _eng_iterate_parallel(engine: number, firstT: number, count: number): void;
  _eng_exploitability_parallel(engine: number, out: number): void;
  _eng_trunk_chance_ev(engine: number, node: number, out: number): void;

  /** Runout equity tables (native/solver/equity.cpp). */
  _eq_create(heroCount: number, heroCards: number, heroStrength: number, villainCount: number, villainCards: number, villainStrength: number): number;
  _eq_destroy(ctx: number): void;
  _eq_table(ctx: number, slotCount: number, slots: number, unavailable: number, out: number): void;
}

export interface SolverModuleOptions {
  /** Threaded builds: pool threads to start with the module (they can't be started later from a blocked thread). */
  pthreadPoolSize?: number;
  /** Threaded web build: starts one pool worker (see native/build-wasm.sh and pthreadEntry.ts). */
  createPthreadWorker?: () => Worker;
}

export type CreateSolverModule = (options?: SolverModuleOptions) => Promise<SolverModule>;
