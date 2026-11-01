import { describe, expect, it } from "vitest";
import { clusteredNextCards, sampleNextCards, stratifiedNextCards, DEFAULT_PRECISE_SAMPLE_COUNT, MAX_PRECISE_SAMPLE_COUNT } from "./nextCardSampling";

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

describe("stratifiedNextCards", () => {
  const board = ["Kh", "7h", "2d", "As"]; // two hearts: hearts can bring a flush on the river

  it("returns `count` distinct cards off the board whose weights add up like dealing every card", () => {
    const sample = stratifiedNextCards(board, 12);
    expect(sample).toHaveLength(12);
    expect(new Set(sample.map((s) => s.card)).size).toBe(12);
    for (const { card } of sample) expect(board).not.toContain(card);
    // dealEveryCard: 48 cards × 1/44.
    expect(sample.reduce((sum, s) => sum + s.weight, 0)).toBeCloseTo(48 / 44, 10);
  });

  it("keeps flush-relevant cards and board-pairing cards represented", () => {
    const cards = stratifiedNextCards(board, 12).map((s) => s.card);
    expect(cards.some((c) => c[1] === "h")).toBe(true);
    expect(cards.some((c) => ["K", "7", "2", "A"].includes(c[0]))).toBe(true);
  });

  it("gives each card weight in proportion to the run of similar cards it stands for", () => {
    const sample = stratifiedNextCards(board, 5); // 48 cards → runs of 9 or 10
    for (const { weight } of sample) expect([9 / 44, 10 / 44].some((w) => Math.abs(weight - w) < 1e-12)).toBe(true);
  });

  it("is every remaining card, equally weighted, when the count covers the deck", () => {
    const sample = stratifiedNextCards(board, 100);
    expect(sample).toHaveLength(48);
    for (const { weight } of sample) expect(weight).toBeCloseTo(1 / 44, 12);
  });

  it("is deterministic", () => {
    expect(stratifiedNextCards(board, 12)).toEqual(stratifiedNextCards(board, 12));
  });
});

describe("clusteredNextCards", () => {
  const board = ["Kh", "7s", "2d"];
  const rank = (card: string) => "23456789TJQKA".indexOf(card[0]);

  it("weighs each card for the cards it stands for, summing like every card dealt", () => {
    const dealt = clusteredNextCards(board, 8, (card) => Float32Array.of(rank(card)));
    expect(dealt).toHaveLength(8);
    expect(new Set(dealt.map((d) => d.card)).size).toBe(8);
    expect(dealt.reduce((sum, d) => sum + d.weight, 0)).toBeCloseTo(49 / 45, 6);
  });

  it("groups cards by their features: ranks here, so no two chosen cards share one", () => {
    const dealt = clusteredNextCards(board, 13, (card) => Float32Array.of(rank(card)));
    expect(new Set(dealt.map((d) => d.card[0])).size).toBe(13);
  });

  it("ignores a combo that sees only one of two cards (NaN)", () => {
    const features = (card: string) => Float32Array.of(card === "As" ? NaN : rank(card), rank(card));
    const dealt = clusteredNextCards(board, 13, features);
    expect(new Set(dealt.map((d) => d.card[0])).size).toBe(13);
  });

  it("keeps suits near their share of the deck, though features can't tell them apart", () => {
    const dealt = clusteredNextCards(board, 13, (card) => Float32Array.of(rank(card)));
    for (const suit of "shdc") expect(dealt.filter((d) => d.card[1] === suit).length).toBeGreaterThanOrEqual(2);
  });

  it("still returns distinct cards when every card looks the same", () => {
    const dealt = clusteredNextCards(board, 6, () => Float32Array.of(1));
    expect(new Set(dealt.map((d) => d.card)).size).toBe(6);
    expect(dealt.reduce((sum, d) => sum + d.weight, 0)).toBeCloseTo(49 / 45, 6);
  });

  it("deals every card when asked for at least that many", () => {
    expect(clusteredNextCards(board, 49, () => Float32Array.of(1))).toEqual(stratifiedNextCards(board, 49));
  });
});
