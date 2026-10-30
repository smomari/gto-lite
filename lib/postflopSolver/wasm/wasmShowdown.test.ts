// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ALL_HANDS } from "@/lib/handRange/handList";
import { expandToCombos } from "../combos";
import { buildEquityTable } from "../terminalEquity";
import { deriveShowdownLayout } from "../showdownBatch";
import { singleThreadShowdown } from "../showdownExecutor";
import { buildStreetTree, type DecisionNode } from "../treeBuilder";
import { runCfr } from "../cfr";
import { computeExploitability } from "../exploitability";
import { loadNodeSolverModule } from "./loadNode";
import { createWasmShowdown } from "./wasmShowdown";

const BOARD = ["Kh", "7s", "2d"];
const range = (from: number, to: number) =>
  expandToCombos(
    ALL_HANDS.slice(from, to).map((h) => ({ hand: h.hand, fold: 0, call: 1, raise: 0 })),
    (hf) => hf.call,
    BOARD,
  );
const hero = range(0, 12);
const villain = range(5, 20);
const table = buildEquityTable(hero, villain, BOARD);
const heroLayout = deriveShowdownLayout(table.heroEquity, hero.map((c) => c.cards), villain.map((c) => c.cards));
const villainLayout = deriveShowdownLayout(table.villainEquity, villain.map((c) => c.cards), hero.map((c) => c.cards));
const NODES = 3;

/** Deterministic, uneven reach (some zeros) so a slicing mistake can't hide behind uniform values. */
function fillReach(heroReach: Float64Array, villainReach: Float64Array) {
  heroReach.forEach((_, k) => (heroReach[k] = (k * 37) % 11 === 0 ? 0 : ((k * 13) % 7) / 7));
  villainReach.forEach((_, k) => (villainReach[k] = (k * 29) % 13 === 0 ? 0 : ((k * 17) % 5) / 5));
}

describe("WASM showdown executor", () => {
  it("matches the TypeScript kernel within f32 rounding", async () => {
    const expected = singleThreadShowdown.prepare(heroLayout, villainLayout, NODES);
    fillReach(expected.heroReach, expected.villainReach);
    expected.evaluate();

    const run = createWasmShowdown(await loadNodeSolverModule()).prepare(heroLayout, villainLayout, NODES);
    fillReach(run.heroReach, run.villainReach);
    run.evaluate();

    expected.heroEquity.forEach((x, i) => expect(run.heroEquity[i]).toBeCloseTo(x, 6));
    expected.villainEquity.forEach((x, i) => expect(run.villainEquity[i]).toBeCloseTo(x, 6));
    run.dispose?.();
  });

  it("keeps working after another run grows WASM memory", async () => {
    const solver = await loadNodeSolverModule();
    const run = createWasmShowdown(solver).prepare(heroLayout, villainLayout, NODES);
    // A large second context forces memory growth, which replaces the buffer behind the first run's views.
    const big = createWasmShowdown(solver).prepare(
      { ...heroLayout, rows: 2000, cols: 2000, equity: new Float32Array(4_000_000), rowCards: new Uint8Array(4000), colCards: new Uint8Array(4000), rowSameCol: new Int32Array(2000) },
      { ...villainLayout, rows: 2000, cols: 2000, equity: new Float32Array(4_000_000), rowCards: new Uint8Array(4000), colCards: new Uint8Array(4000), rowSameCol: new Int32Array(2000) },
      1,
    );
    run.evaluate(); // refreshes views onto the new buffer
    fillReach(run.heroReach, run.villainReach);
    run.evaluate();

    const expected = singleThreadShowdown.prepare(heroLayout, villainLayout, NODES);
    fillReach(expected.heroReach, expected.villainReach);
    expected.evaluate();
    expected.heroEquity.forEach((x, i) => expect(run.heroEquity[i]).toBeCloseTo(x, 6));
    big.dispose?.();
    run.dispose?.();
  });

  it("gives runCfr the same solution as the TypeScript kernel", async () => {
    const tree = buildStreetTree(10, 50, "flop") as DecisionNode;
    const options = { maxIterations: 200 };
    const ts = runCfr(tree, hero, villain, table, options);
    const wasm = runCfr(tree, hero, villain, table, { ...options, showdownExecutor: createWasmShowdown(await loadNodeSolverModule()) });

    // ~1e-7 equity rounding nudges regret matching each iteration, so strategies drift slightly apart (~1e-4 at 200 iterations).
    const tsRoot = ts.getAverageStrategy(tree);
    const wasmRoot = wasm.getAverageStrategy(tree);
    tsRoot.forEach((row, c) => row.forEach((p, a) => expect(Math.abs(wasmRoot[c][a] - p)).toBeLessThan(1e-3)));
    const exploitability = (s: typeof ts) => computeExploitability(tree, s, hero, villain, table, 10).percentOfPot;
    expect(Math.abs(exploitability(wasm) / exploitability(ts) - 1)).toBeLessThan(0.01);
  });
});
