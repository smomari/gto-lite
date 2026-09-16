import { describe, expect, it, vi } from "vitest";
import {
  comboVsComboRunoutEquity,
  buildEquityTable,
  equityVsRange,
  equityAt,
  FULL_DECK,
  remainingDeck,
} from "./terminalEquity";
import type { ComboRange } from "./types";
import * as handEval from "./handEval";

const BOARD = ["Th", "9s", "2d"]; // dry, disconnected

describe("FULL_DECK / remainingDeck", () => {
  it("FULL_DECK has all 52 cards, each unique", () => {
    expect(FULL_DECK).toHaveLength(52);
    expect(new Set(FULL_DECK).size).toBe(52);
  });

  it("remainingDeck excludes exactly the used cards", () => {
    const used = ["Kh", "7s", "2d"];
    const remaining = remainingDeck(used);
    expect(remaining).toHaveLength(49);
    for (const card of used) expect(remaining).not.toContain(card);
  });
});

describe("comboVsComboRunoutEquity", () => {
  it("is exactly symmetric (exact enumeration, no Monte Carlo variance)", () => {
    const a = comboVsComboRunoutEquity(["As", "Kd"], ["7c", "2c"], BOARD);
    const b = comboVsComboRunoutEquity(["7c", "2c"], ["As", "Kd"], BOARD);
    expect(a + b).toBeCloseTo(1, 10);
  });

  it("favors a big overpair against two overcards that missed (~75%, the known real value for this exact matchup type)", () => {
    // Villain holds AK (two overcards to the board, no pair); hero holds
    // pocket queens (an overpair to this dry T-9-2 board). With only turn+river
    // left, an overpair vs two live overcards runs in the mid-70s%, not the
    // ~54% figure people associate with QQ vs AK preflop (a 5-card-to-come spot).
    const equity = comboVsComboRunoutEquity(["Qs", "Qc"], ["Ah", "Kc"], BOARD);
    expect(equity).toBeGreaterThan(0.7);
    expect(equity).toBeLessThan(0.85);
  });

  it("gives a made top pair a big edge over complete air", () => {
    const equity = comboVsComboRunoutEquity(["Tc", "3h"], ["4c", "5d"], BOARD);
    expect(equity).toBeGreaterThan(0.85);
  });

  it("on a 4-card (turn) board, is still exactly symmetric (single river card left)", () => {
    const turnBoard = ["Th", "9s", "2d", "6h"];
    const a = comboVsComboRunoutEquity(["As", "Kd"], ["7c", "2c"], turnBoard);
    const b = comboVsComboRunoutEquity(["7c", "2c"], ["As", "Kd"], turnBoard);
    expect(a + b).toBeCloseTo(1, 10);
  });

  it("on a 4-card (turn) board, gives a set a near-total edge over complete air (only one card left)", () => {
    const turnBoard = ["Kh", "7s", "2d", "9c"]; // scattered, no straight/flush texture
    const equity = comboVsComboRunoutEquity(["Kc", "Kd"], ["4c", "5d"], turnBoard);
    expect(equity).toBeGreaterThan(0.95);
  });

  it("throws for an unsupported board length", () => {
    expect(() => comboVsComboRunoutEquity(["As", "Kd"], ["7c", "2c"], ["Th", "9s"])).toThrow();
    expect(() =>
      comboVsComboRunoutEquity(["As", "Kd"], ["7c", "2c"], ["Th", "9s", "2d", "6h", "3c", "4d"]),
    ).toThrow();
  });
});

describe("buildEquityTable / equityVsRange", () => {
  const heroRange: ComboRange = [{ cards: ["As", "Kd"], weight: 1 }];

  it("matches a direct pairwise computation for a single-combo range", () => {
    const villainRange: ComboRange = [{ cards: ["Tc", "3h"], weight: 1 }];
    const table = buildEquityTable(heroRange, villainRange, BOARD);
    const direct = comboVsComboRunoutEquity(["As", "Kd"], ["Tc", "3h"], BOARD);
    expect(equityVsRange(table, "P1", 0, villainRange.map((c) => c.weight))).toBeCloseTo(direct, 10);
  });

  it("weights a two-combo range by their relative weights", () => {
    const villainRange: ComboRange = [
      { cards: ["Tc", "3h"], weight: 1 }, // top pair
      { cards: ["4c", "5d"], weight: 3 }, // air, weighted 3x as likely
    ];
    const table = buildEquityTable(heroRange, villainRange, BOARD);
    const vsTopPair = comboVsComboRunoutEquity(["As", "Kd"], ["Tc", "3h"], BOARD);
    const vsAir = comboVsComboRunoutEquity(["As", "Kd"], ["4c", "5d"], BOARD);
    const expected = (vsTopPair * 1 + vsAir * 3) / 4;
    expect(equityVsRange(table, "P1", 0, villainRange.map((c) => c.weight))).toBeCloseTo(expected, 10);
  });

  it("card-removal correction: fully excludes (not just zero-weights) a villain combo that shares hero's own card", () => {
    // Hero holds As. A combo in villain's *nominal* range also uses As —
    // physically impossible once hero holds it — so it must be dropped
    // entirely from both the weighted sum AND the weight total, not merely
    // contribute zero equity while still diluting the denominator.
    const villainRange: ComboRange = [
      { cards: ["Tc", "3h"], weight: 1 },
      { cards: ["As", "Qh"], weight: 1 }, // blocked by hero's As
    ];
    const table = buildEquityTable(heroRange, villainRange, BOARD);
    const onlyValidCombo = comboVsComboRunoutEquity(["As", "Kd"], ["Tc", "3h"], BOARD);
    expect(equityVsRange(table, "P1", 0, villainRange.map((c) => c.weight))).toBeCloseTo(onlyValidCombo, 10);
  });

  it("returns a neutral 0.5 when the villain range is entirely empty/blocked", () => {
    const villainRange: ComboRange = [{ cards: ["As", "Qh"], weight: 1 }]; // fully blocked
    const table = buildEquityTable(heroRange, villainRange, BOARD);
    expect(equityVsRange(table, "P1", 0, villainRange.map((c) => c.weight))).toBe(0.5);
  });

  it("the precompute-then-compare algorithm matches the naive per-pair reference for every unblocked pair in a multi-combo range", () => {
    const hRange: ComboRange = [
      { cards: ["As", "Kd"], weight: 1 },
      { cards: ["Qs", "Qh"], weight: 1 },
    ];
    const vRange: ComboRange = [
      { cards: ["Tc", "3h"], weight: 1 },
      { cards: ["4c", "5d"], weight: 1 },
      { cards: ["8c", "8d"], weight: 1 },
    ];
    const table = buildEquityTable(hRange, vRange, BOARD);
    for (let i = 0; i < hRange.length; i++) {
      for (let j = 0; j < vRange.length; j++) {
        if (hRange[i].cards.some((c) => vRange[j].cards.includes(c))) continue; // card-blocked, skip
        const direct = comboVsComboRunoutEquity(hRange[i].cards, vRange[j].cards, BOARD);
        expect(equityAt(table, i, j)).toBeCloseTo(direct, 10);
      }
    }
  });

  it("regression guard: builds the table with O(combos) hand evaluations, not O(comboPairs)", () => {
    const spy = vi.spyOn(handEval, "handRank");
    spy.mockClear();
    const hRange: ComboRange = [
      { cards: ["As", "Kd"], weight: 1 },
      { cards: ["Qs", "Qh"], weight: 1 },
      { cards: ["Jc", "Jd"], weight: 1 },
    ];
    const vRange: ComboRange = [
      { cards: ["Tc", "3h"], weight: 1 },
      { cards: ["4c", "5d"], weight: 1 },
      { cards: ["8c", "8d"], weight: 1 },
    ];
    buildEquityTable(hRange, vRange, BOARD);
    // A naive per-pair algorithm (comboVsComboRunoutEquity per pair) would call
    // handRank roughly 2 * 9 pairs * 990 runouts ≈ 17,820 times. The
    // precompute-then-compare algorithm should call it only ~(3+3) combos *
    // 990 runouts = 5,940 times — well under the naive pair-count lower bound.
    expect(spy.mock.calls.length).toBeLessThan(9 * 990);
    spy.mockRestore();
  });
});
