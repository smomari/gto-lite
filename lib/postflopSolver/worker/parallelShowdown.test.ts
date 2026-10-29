import { describe, expect, it } from "vitest";
import { ALL_HANDS } from "@/lib/handRange/handList";
import { expandToCombos } from "../combos";
import { buildEquityTable } from "../terminalEquity";
import { deriveShowdownLayout, opponentCardWeightsInto } from "../showdownBatch";
import { singleThreadShowdown } from "../showdownExecutor";
import { computeSlice, createParallelShowdown, createSharedShowdown, splitRange, viewSharedShowdown } from "./parallelShowdown";

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

function singleThreadResult() {
  const run = singleThreadShowdown.prepare(heroLayout, villainLayout, NODES);
  fillReach(run.heroReach, run.villainReach);
  run.evaluate();
  return { hero: [...run.heroEquity], villain: [...run.villainEquity] };
}

describe("splitRange", () => {
  it("covers every row exactly once, in order, for uneven splits", () => {
    for (const [count, parts] of [[265, 6], [7, 3], [2, 5]]) {
      const ranges = Array.from({ length: parts }, (_, i) => splitRange(count, parts, i));
      expect(ranges[0][0]).toBe(0);
      expect(ranges.at(-1)![1]).toBe(count);
      for (let i = 1; i < parts; i++) expect(ranges[i][0]).toBe(ranges[i - 1][1]);
    }
  });
});

describe("parallel showdown", () => {
  it("every participant computing its own slice of the shared buffers reproduces the single-thread result exactly", () => {
    const parts = 4;
    const views = viewSharedShowdown(createSharedShowdown(heroLayout, villainLayout, NODES, parts));
    fillReach(views.heroReach, views.villainReach);
    opponentCardWeightsInto(views.hero, views.villainReach, NODES, views.villainWeights);
    opponentCardWeightsInto(views.villain, views.heroReach, NODES, views.heroWeights);
    for (let part = 0; part < parts; part++) computeSlice(views, part, parts);

    const expected = singleThreadResult();
    expect([...views.heroEquity]).toEqual(expected.hero);
    expect([...views.villainEquity]).toEqual(expected.villain);
  });

  it("with no helper ports, the parallel executor still evaluates on its own thread", () => {
    const run = createParallelShowdown([]).prepare(heroLayout, villainLayout, NODES);
    fillReach(run.heroReach, run.villainReach);
    run.evaluate();

    const expected = singleThreadResult();
    expect([...run.heroEquity]).toEqual(expected.hero);
    expect([...run.villainEquity]).toEqual(expected.villain);
  });
});
