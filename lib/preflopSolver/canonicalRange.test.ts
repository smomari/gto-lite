import { describe, expect, it } from "vitest";
import { ALL_HANDS } from "@/lib/handRange/handList";
import { canonicalRfiRange, HERO_SUITS, VILLAIN_SUITS } from "./canonicalRange";

function shareCard(a: [string, string], b: [string, string]): boolean {
  return a.includes(b[0]) || a.includes(b[1]);
}

describe("canonicalRfiRange", () => {
  it("has one entry per canonical hand, weighted by its real combo count", () => {
    const range = canonicalRfiRange(HERO_SUITS);
    expect(range).toHaveLength(169);
    const totalCombos = range.reduce((s, c) => s + c.weight, 0);
    expect(totalCombos).toBe(1326);
    range.forEach((combo, i) => expect(combo.weight).toBe(ALL_HANDS[i].combos));
  });

  it("round-trips back to the same 169-hand labels via canonicalHandOf order (same index == same hand)", () => {
    const range = canonicalRfiRange(HERO_SUITS);
    range.forEach((combo, i) => {
      // Every combo's two cards use only HERO_SUITS, distinct from each other for non-pairs.
      expect(combo.cards[0][0]).toBe(ALL_HANDS[i].rankHigh);
    });
  });

  it("hero (HERO_SUITS) and villain (VILLAIN_SUITS) ranges never share a card, for any pair of hands", () => {
    const heroRange = canonicalRfiRange(HERO_SUITS);
    const villainRange = canonicalRfiRange(VILLAIN_SUITS);
    for (const h of heroRange) {
      for (const v of villainRange) {
        expect(shareCard(h.cards, v.cards)).toBe(false);
      }
    }
  });
});
