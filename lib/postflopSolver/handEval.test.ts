import { describe, expect, it } from "vitest";
import { compareHands, handRank } from "./handEval";

describe("handRank (pins phe's raw convention: smaller number = stronger hand)", () => {
  it("ranks a royal flush stronger (smaller) than two pair, a pair, and high card", () => {
    const royalFlush = handRank(["As", "Ks", "Qs", "Js", "Ts"]);
    const twoPair = handRank(["2s", "2h", "9d", "9c", "Ad"]);
    const pair = handRank(["2s", "2h", "9d", "Jc", "Ad"]);
    const highCard = handRank(["2s", "5h", "9d", "Jc", "Ad"]);

    expect(royalFlush).toBeLessThan(twoPair);
    expect(twoPair).toBeLessThan(pair);
    expect(pair).toBeLessThan(highCard);
  });
});

describe("compareHands (normal comparator convention: positive = first arg wins)", () => {
  it("returns positive when handA is stronger", () => {
    const nuts = ["As", "Ks", "Qs", "Js", "Ts"]; // royal flush
    const weak = ["2s", "5h", "9d", "Jc", "Ad"]; // high card
    expect(compareHands(nuts, weak)).toBeGreaterThan(0);
    expect(compareHands(weak, nuts)).toBeLessThan(0);
  });

  it("returns 0 for a tied board (both players play the board)", () => {
    const board = ["As", "Ks", "Qs", "Js", "Ts"];
    // Both hands' best 5-card hand is just the board itself (royal flush).
    const handA = [...board, "2h", "3h"];
    const handB = [...board, "4c", "5c"];
    expect(compareHands(handA, handB)).toBe(0);
  });

  it("compares 7-card hands (hole cards + full board)", () => {
    const boardPair = ["9s", "9h", "2d", "5c", "Kc"];
    const trips = [...boardPair, "9c", "3h"]; // hero holds a 9 for trips
    const topPair = [...boardPair, "Kh", "4h"]; // villain holds a K for top pair
    expect(compareHands(trips, topPair)).toBeGreaterThan(0);
  });
});
