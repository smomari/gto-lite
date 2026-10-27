import { describe, expect, it } from "vitest";
import { FULL_DECK, comboKey, remainingDeck } from "./cards";

describe("FULL_DECK", () => {
  it("has 52 unique cards in rank-major order", () => {
    expect(FULL_DECK).toHaveLength(52);
    expect(new Set(FULL_DECK).size).toBe(52);
    expect(FULL_DECK.slice(0, 4)).toEqual(["As", "Ah", "Ad", "Ac"]);
  });
});

describe("remainingDeck", () => {
  it("drops used cards and keeps FULL_DECK order", () => {
    const deck = remainingDeck(["Ah", "2c"]);
    expect(deck).toHaveLength(50);
    expect(deck).not.toContain("Ah");
    expect(deck).not.toContain("2c");
    expect(deck.slice(0, 3)).toEqual(["As", "Ad", "Ac"]);
  });
});

describe("comboKey", () => {
  it("is order-independent", () => {
    expect(comboKey(["Ac", "Kc"])).toBe(comboKey(["Kc", "Ac"]));
  });

  it("differs for different combos", () => {
    expect(comboKey(["Ac", "Kc"])).not.toBe(comboKey(["Ad", "Kd"]));
  });
});
