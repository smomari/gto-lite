import { describe, expect, it } from "vitest";
import { buildEquityTable, equityVsRange } from "./terminalEquity";
import { equityTableFromEntries } from "./equityTableTestUtils";
import { deriveShowdownLayout, opponentCardWeights, showdownEquities } from "./showdownBatch";
import type { ComboRange } from "./types";

const BOARD = ["Kh", "7s", "2d"];
// Several villain combos share a card with a hero combo (blocked pairs), and one holds the exact same two cards.
const hero: ComboRange = [
  { cards: ["As", "Ks"], weight: 1 },
  { cards: ["Qh", "Qd"], weight: 1 },
  { cards: ["7h", "6h"], weight: 1 },
];
const villain: ComboRange = [
  { cards: ["As", "Ks"], weight: 1 },
  { cards: ["Ac", "Qd"], weight: 1 },
  { cards: ["7c", "6c"], weight: 1 },
  { cards: ["9h", "8h"], weight: 1 },
  { cards: ["Jd", "Td"], weight: 1 },
];

/** Two showdown nodes' worth of villain reach, node-major, including a zero weight. */
const reachByNode = [
  [0.5, 1, 0, 0.25, 0.8],
  [1, 0.1, 0.6, 0, 0.3],
];

describe("showdownEquities", () => {
  const table = buildEquityTable(hero, villain, BOARD);
  const layout = deriveShowdownLayout(table.heroEquity, hero.map((c) => c.cards), villain.map((c) => c.cards));
  const reach = Float64Array.from(reachByNode.flat());
  const weights = opponentCardWeights(layout, reach, reachByNode.length);

  it("matches equityVsRange for every (combo, node), blockers included", () => {
    const out = new Float64Array(reachByNode.length * hero.length);
    showdownEquities(layout, reach, weights, reachByNode.length, 0, hero.length, out);
    reachByNode.forEach((nodeReach, s) => {
      hero.forEach((_, i) => {
        expect(out[s * hero.length + i]).toBeCloseTo(equityVsRange(table, "P1", i, nodeReach), 6);
      });
    });
  });

  it("scores 0.5 when every opponent combo with weight is blocked", () => {
    const onlyBlocked = Float64Array.from([1, 0, 0, 0, 0]); // just the AsKs villain combo
    const out = new Float64Array(hero.length);
    showdownEquities(layout, onlyBlocked, opponentCardWeights(layout, onlyBlocked, 1), 1, 0, 1, out);
    expect(out[0]).toBe(0.5);
  });

  it("disjoint row ranges together give the same result as one full pass", () => {
    const full = new Float64Array(reachByNode.length * hero.length);
    const split = new Float64Array(reachByNode.length * hero.length);
    showdownEquities(layout, reach, weights, reachByNode.length, 0, hero.length, full);
    showdownEquities(layout, reach, weights, reachByNode.length, 0, 1, split);
    showdownEquities(layout, reach, weights, reachByNode.length, 1, hero.length, split);
    expect([...split]).toEqual([...full]);
  });
});

describe("deriveShowdownLayout", () => {
  it("refuses a table whose missing pairs aren't exactly the card-sharing pairs", () => {
    const table = equityTableFromEntries(hero, villain, new Map()); // every pair missing, most share no card
    expect(() => deriveShowdownLayout(table.heroEquity, hero.map((c) => c.cards), villain.map((c) => c.cards))).toThrow(
      /missing an equity without sharing a card/,
    );
  });
});
