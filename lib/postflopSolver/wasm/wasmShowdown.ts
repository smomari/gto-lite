import type { ShowdownLayout } from "../showdownBatch";
import type { ShowdownExecutor, ShowdownRun } from "../showdownExecutor";
import type { SolverModule } from "./solverModule";

const HERO = 0;
const VILLAIN = 1;

/**
 * Showdown batch evaluated by the C++ core (native/solver/showdown.cpp) —
 * about 10x the TypeScript kernel (f32 SIMD dot products; equities within
 * ~1e-7 of it). The run's reach/equity arrays are views straight into WASM
 * memory, so the CFR loop writes reach and reads equities with no copying.
 */
export function createWasmShowdown(solver: SolverModule): ShowdownExecutor {
  return {
    prepare(heroLayout, villainLayout, nodeCount) {
      const ctx = solver._sd_create(heroLayout.rows, villainLayout.rows, nodeCount);
      fillSide(solver, ctx, HERO, heroLayout);
      fillSide(solver, ctx, VILLAIN, villainLayout);

      let buffer: ArrayBufferLike | null = null;
      const run: ShowdownRun = {
        heroReach: new Float64Array(0),
        villainReach: new Float64Array(0),
        heroEquity: new Float64Array(0),
        villainEquity: new Float64Array(0),
        evaluate() {
          refreshViews();
          solver._sd_evaluate(ctx);
        },
        dispose() {
          solver._sd_destroy(ctx);
        },
      };

      /** Views are only replaced when memory grew (another context allocated since). */
      function refreshViews() {
        const heap = solver.HEAPF64;
        if (heap.buffer === buffer) return;
        buffer = heap.buffer;
        const view = (ptr: number, length: number) => heap.subarray(ptr / 8, ptr / 8 + length);
        // The hero side's opponent is the villain: its reach buffer holds villain reach.
        run.villainReach = view(solver._sd_opponent_reach(ctx, HERO), nodeCount * heroLayout.cols);
        run.heroReach = view(solver._sd_opponent_reach(ctx, VILLAIN), nodeCount * villainLayout.cols);
        run.heroEquity = view(solver._sd_out(ctx, HERO), nodeCount * heroLayout.rows);
        run.villainEquity = view(solver._sd_out(ctx, VILLAIN), nodeCount * villainLayout.rows);
      }
      refreshViews();
      return run;
    },
  };
}

function fillSide(solver: SolverModule, ctx: number, side: number, layout: ShowdownLayout): void {
  solver.HEAPF32.set(layout.equity, solver._sd_equity(ctx, side) / 4);
  solver.HEAPU8.set(layout.rowCards, solver._sd_row_cards(ctx, side));
  solver.HEAPU8.set(layout.colCards, solver._sd_col_cards(ctx, side));
  solver.HEAP32.set(layout.rowSameCol, solver._sd_row_same_col(ctx, side) / 4);
}
