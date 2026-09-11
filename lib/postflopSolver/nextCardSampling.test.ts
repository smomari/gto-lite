import { describe, expect, it } from "vitest";
import { sampleNextCards, DEFAULT_PRECISE_SAMPLE_COUNT, MAX_PRECISE_SAMPLE_COUNT } from "./nextCardSampling";

describe("sampleNextCards", () => {
  it("returns exactly `count` cards, none overlapping the used cards", () => {
    const used = ["Kh", "7s", "2d"]; // a flop board
    const sampled = sampleNextCards(used, DEFAULT_PRECISE_SAMPLE_COUNT);
    expect(sampled).toHaveLength(DEFAULT_PRECISE_SAMPLE_COUNT);
    for (const card of sampled) expect(used).not.toContain(card);
  });

  it("is deterministic across calls with the same input", () => {
    const used = ["Kh", "7s", "2d"];
    expect(sampleNextCards(used, 5)).toEqual(sampleNextCards(used, 5));
  });

  it("respects MAX_PRECISE_SAMPLE_COUNT as a sane upper bound relative to the remaining deck", () => {
    const used = ["Kh", "7s", "2d"];
    const sampled = sampleNextCards(used, MAX_PRECISE_SAMPLE_COUNT);
    expect(sampled).toHaveLength(MAX_PRECISE_SAMPLE_COUNT);
    expect(new Set(sampled).size).toBe(MAX_PRECISE_SAMPLE_COUNT); // no duplicates
  });

  it("returns the full remaining deck when count exceeds the deck size", () => {
    // 52 - 3 = 49 remaining cards after a 3-card board.
    const used = ["Kh", "7s", "2d"];
    const sampled = sampleNextCards(used, 100);
    expect(sampled).toHaveLength(49);
  });

  it("spreads samples across the deck rather than clustering at one end", () => {
    const used = ["Kh", "7s", "2d"];
    const sampled = sampleNextCards(used, 5);
    const indices = sampled.map((c) => c.charCodeAt(0));
    // Not all identical — a real spread, not the same card 5 times.
    expect(new Set(indices).size).toBeGreaterThan(1);
  });
});
