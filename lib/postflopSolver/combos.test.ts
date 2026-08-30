import { describe, expect, it } from "vitest";
import { ALL_HANDS } from "@/lib/handRange/handList";
import type { HandFrequency } from "@/types/rangeData";
import { enumerateCombos, expandToCombos, TOTAL_PREFLOP_COMBOS } from "./combos";

describe("enumerateCombos", () => {
  it("gives a pair 6 combos, all same rank different suits", () => {
    const combos = enumerateCombos("AA");
    expect(combos).toHaveLength(6);
    for (const [a, b] of combos) {
      expect(a[0]).toBe("A");
      expect(b[0]).toBe("A");
      expect(a[1]).not.toBe(b[1]);
    }
  });

  it("gives a suited hand 4 combos, same suit both cards", () => {
    const combos = enumerateCombos("AKs");
    expect(combos).toHaveLength(4);
    for (const [a, b] of combos) expect(a[1]).toBe(b[1]);
  });

  it("gives an offsuit hand 12 combos, different suits", () => {
    const combos = enumerateCombos("AKo");
    expect(combos).toHaveLength(12);
    for (const [a, b] of combos) expect(a[1]).not.toBe(b[1]);
  });

  it("enumerating every canonical hand sums to 1326 combos total", () => {
    const total = ALL_HANDS.reduce((sum, h) => sum + enumerateCombos(h.hand).length, 0);
    expect(total).toBe(TOTAL_PREFLOP_COMBOS);
    expect(total).toBe(1326);
  });
});

describe("expandToCombos", () => {
  function makeUniformHands(weightFor: (hand: string) => number): HandFrequency[] {
    return ALL_HANDS.map((h) => ({ hand: h.hand, fold: 0, call: weightFor(h.hand), raise: 0 }));
  }

  it("weights every physical combo of a hand identically to that hand's frequency", () => {
    const hands = makeUniformHands((hand) => (hand === "AA" ? 0.5 : 0));
    const range = expandToCombos(hands, (hf) => hf.call, []);
    expect(range).toHaveLength(6);
    for (const combo of range) expect(combo.weight).toBe(0.5);
  });

  it("drops hands with zero weight entirely", () => {
    const hands = makeUniformHands(() => 0);
    const range = expandToCombos(hands, (hf) => hf.call, []);
    expect(range).toHaveLength(0);
  });

  it("removes combos that share a card with the board", () => {
    const hands = makeUniformHands((hand) => (hand === "AA" ? 1 : 0));
    const range = expandToCombos(hands, (hf) => hf.call, ["Ah"]);
    // 6 AA combos total; 3 of them include the Ah suit paired with each other suit.
    expect(range).toHaveLength(3);
    for (const combo of range) {
      expect(combo.cards).not.toContain("Ah");
    }
  });

  it("expanding a full uniform-weight range gives 1326 total weighted combos with no board", () => {
    const hands = makeUniformHands(() => 1);
    const range = expandToCombos(hands, (hf) => hf.call, []);
    expect(range).toHaveLength(1326);
  });

  it("respects a custom actionWeight selector (e.g. the raise bucket instead of call)", () => {
    const hands: HandFrequency[] = ALL_HANDS.map((h) => ({
      hand: h.hand,
      fold: 0,
      call: 1,
      raise: h.hand === "KK" ? 1 : 0,
    }));
    const range = expandToCombos(hands, (hf) => hf.raise, []);
    expect(range).toHaveLength(6); // only KK's 6 combos, since raise=0 everywhere else
  });
});
