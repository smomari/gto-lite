import {
  opponentCardWeightsInto,
  showdownEquities,
  type OpponentCardWeights,
  type ShowdownLayout,
} from "../showdownBatch";
import { singleThreadShowdown, type ShowdownExecutor, type ShowdownRun } from "../showdownExecutor";

/**
 * Showdown batch split across worker threads that share memory. The solver
 * worker and each helper own a disjoint slice of rows (hero rows and villain
 * rows, both split evenly), so results match the single-thread executor
 * exactly. Per iteration: the solver bumps GEN and wakes the helpers, computes
 * its own slice, then waits until DONE reaches the helper count.
 */

const DECK_SIZE = 52;
const GEN = 0;
const DONE = 1;
const READY = 2;
/** Give up on helpers that never report in (failed to load) and solve on this thread instead. */
const HELPER_READY_TIMEOUT_MS = 5000;

interface SharedLayout {
  rows: number;
  cols: number;
  equity: SharedArrayBuffer;
  colCards: SharedArrayBuffer;
  rowCards: SharedArrayBuffer;
  rowSameCol: SharedArrayBuffer;
}

/** Everything a helper needs, posted once per solve — all buffers are shared, nothing is copied per iteration. */
export interface ShowdownHelperSetup {
  nodeCount: number;
  parts: number;
  part: number;
  hero: SharedLayout;
  villain: SharedLayout;
  heroReach: SharedArrayBuffer;
  villainReach: SharedArrayBuffer;
  heroEquity: SharedArrayBuffer;
  villainEquity: SharedArrayBuffer;
  heroWeightsTotal: SharedArrayBuffer;
  heroWeightsByCard: SharedArrayBuffer;
  villainWeightsTotal: SharedArrayBuffer;
  villainWeightsByCard: SharedArrayBuffer;
  control: SharedArrayBuffer;
}

interface SharedViews {
  nodeCount: number;
  hero: ShowdownLayout;
  villain: ShowdownLayout;
  heroReach: Float64Array;
  villainReach: Float64Array;
  heroEquity: Float64Array;
  villainEquity: Float64Array;
  /** Weight of HERO combos per card — what the villain side needs. */
  heroWeights: OpponentCardWeights;
  villainWeights: OpponentCardWeights;
  control: Int32Array;
}

function shared(bytes: number): SharedArrayBuffer {
  return new SharedArrayBuffer(Math.max(bytes, 8));
}

function shareLayout(layout: ShowdownLayout): SharedLayout {
  const equity = shared(layout.equity.byteLength);
  const colCards = shared(layout.colCards.byteLength);
  const rowCards = shared(layout.rowCards.byteLength);
  const rowSameCol = shared(layout.rowSameCol.byteLength);
  new Float32Array(equity).set(layout.equity);
  new Uint8Array(colCards).set(layout.colCards);
  new Uint8Array(rowCards).set(layout.rowCards);
  new Int32Array(rowSameCol).set(layout.rowSameCol);
  return { rows: layout.rows, cols: layout.cols, equity, colCards, rowCards, rowSameCol };
}

function viewLayout(s: SharedLayout): ShowdownLayout {
  return {
    rows: s.rows,
    cols: s.cols,
    equity: new Float32Array(s.equity, 0, s.rows * s.cols),
    colCards: new Uint8Array(s.colCards, 0, s.cols * 2),
    rowCards: new Uint8Array(s.rowCards, 0, s.rows * 2),
    rowSameCol: new Int32Array(s.rowSameCol, 0, s.rows),
  };
}

/** Shared buffers for one solve; `part` is filled in per recipient. */
export function createSharedShowdown(
  heroLayout: ShowdownLayout,
  villainLayout: ShowdownLayout,
  nodeCount: number,
  parts: number,
): Omit<ShowdownHelperSetup, "part"> {
  const heroCount = heroLayout.rows;
  const villainCount = villainLayout.rows;
  const f64 = (n: number) => shared(n * Float64Array.BYTES_PER_ELEMENT);
  return {
    nodeCount,
    parts,
    hero: shareLayout(heroLayout),
    villain: shareLayout(villainLayout),
    heroReach: f64(nodeCount * heroCount),
    villainReach: f64(nodeCount * villainCount),
    heroEquity: f64(nodeCount * heroCount),
    villainEquity: f64(nodeCount * villainCount),
    heroWeightsTotal: f64(nodeCount),
    heroWeightsByCard: f64(nodeCount * DECK_SIZE),
    villainWeightsTotal: f64(nodeCount),
    villainWeightsByCard: f64(nodeCount * DECK_SIZE),
    control: shared(3 * Int32Array.BYTES_PER_ELEMENT),
  };
}

export function viewSharedShowdown(setup: Omit<ShowdownHelperSetup, "part">): SharedViews {
  const hero = viewLayout(setup.hero);
  const villain = viewLayout(setup.villain);
  const n = setup.nodeCount;
  return {
    nodeCount: n,
    hero,
    villain,
    heroReach: new Float64Array(setup.heroReach, 0, n * hero.rows),
    villainReach: new Float64Array(setup.villainReach, 0, n * villain.rows),
    heroEquity: new Float64Array(setup.heroEquity, 0, n * hero.rows),
    villainEquity: new Float64Array(setup.villainEquity, 0, n * villain.rows),
    heroWeights: {
      total: new Float64Array(setup.heroWeightsTotal, 0, n),
      byCard: new Float64Array(setup.heroWeightsByCard, 0, n * DECK_SIZE),
    },
    villainWeights: {
      total: new Float64Array(setup.villainWeightsTotal, 0, n),
      byCard: new Float64Array(setup.villainWeightsByCard, 0, n * DECK_SIZE),
    },
    control: new Int32Array(setup.control, 0, 3),
  };
}

/** Rows [start, end) of `count` for participant `index` of `parts` — together they cover every row exactly once. */
export function splitRange(count: number, parts: number, index: number): [number, number] {
  return [Math.floor((count * index) / parts), Math.floor((count * (index + 1)) / parts)];
}

/** One participant's share of an iteration's showdown batch. */
export function computeSlice(views: SharedViews, part: number, parts: number): void {
  const [heroStart, heroEnd] = splitRange(views.hero.rows, parts, part);
  const [villainStart, villainEnd] = splitRange(views.villain.rows, parts, part);
  showdownEquities(views.hero, views.villainReach, views.villainWeights, views.nodeCount, heroStart, heroEnd, views.heroEquity);
  showdownEquities(views.villain, views.heroReach, views.heroWeights, views.nodeCount, villainStart, villainEnd, views.villainEquity);
}

/** A helper's whole life: report in, then compute its slice every time GEN moves. Never returns — the client terminates it. */
export function runShowdownHelper(setup: ShowdownHelperSetup): void {
  const views = viewSharedShowdown(setup);
  const { control } = views;
  let gen = Atomics.load(control, GEN);
  Atomics.add(control, READY, 1);
  Atomics.notify(control, READY);
  for (;;) {
    Atomics.wait(control, GEN, gen);
    gen = Atomics.load(control, GEN);
    computeSlice(views, setup.part, setup.parts);
    Atomics.add(control, DONE, 1);
    Atomics.notify(control, DONE);
  }
}

function waitUntil(control: Int32Array, index: number, target: number, timeoutMs: number): boolean {
  const deadline = Date.now() + timeoutMs;
  for (let value = Atomics.load(control, index); value < target; value = Atomics.load(control, index)) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return false;
    Atomics.wait(control, index, value, remaining);
  }
  return true;
}

/** Solver-side executor over helpers already connected through `ports` (one per helper worker). */
export function createParallelShowdown(ports: readonly MessagePort[]): ShowdownExecutor {
  return {
    prepare(heroLayout, villainLayout, nodeCount): ShowdownRun {
      const helpers = ports.length;
      const parts = helpers + 1;
      const setup = createSharedShowdown(heroLayout, villainLayout, nodeCount, parts);
      ports.forEach((port, i) => port.postMessage({ ...setup, part: i + 1 } satisfies ShowdownHelperSetup));

      const views = viewSharedShowdown(setup);
      const { control } = views;
      if (!waitUntil(control, READY, helpers, HELPER_READY_TIMEOUT_MS)) {
        return singleThreadShowdown.prepare(heroLayout, villainLayout, nodeCount);
      }

      return {
        heroReach: views.heroReach,
        villainReach: views.villainReach,
        heroEquity: views.heroEquity,
        villainEquity: views.villainEquity,
        evaluate() {
          opponentCardWeightsInto(views.hero, views.villainReach, nodeCount, views.villainWeights);
          opponentCardWeightsInto(views.villain, views.heroReach, nodeCount, views.heroWeights);
          Atomics.store(control, DONE, 0);
          Atomics.add(control, GEN, 1);
          Atomics.notify(control, GEN);
          computeSlice(views, 0, parts);
          waitUntil(control, DONE, helpers, Number.POSITIVE_INFINITY);
        },
      };
    },
  };
}
