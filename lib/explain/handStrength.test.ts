import { describe, expect, it } from "vitest";
import type { SerializedCombo } from "@/types/postflopSolver";
import { strengthBuckets } from "./handStrength";

const combos = (...hands: [string, string][]): SerializedCombo[] => hands.map((cards) => ({ cards, weight: 1 }));

describe("strengthBuckets", () => {
  it("buckets made hands by showdown equity against the opponent's range, ties counted half", () => {
    const board = ["As", "Kd", "7c", "2h", "9s"];
    const opponent = combos(["Kh", "Qh"], ["8h", "8c"], ["6h", "5h"], ["Qc", "Jc"]);
    // A set beats all four; KQ ties one of them; 88 beats two and ties one; 43 plays the board and loses to both ace-highs.
    expect(strengthBuckets(board, combos(["Ah", "Ad"], ["Kc", "Qd"], ["8d", "8s"], ["4h", "3h"]), opponent)).toEqual([
      "nuts",
      "strong",
      "medium",
      "air",
    ]);
  });

  it("calls a weak hand with enough cards to make it strong a draw before the river, but not on it", () => {
    const flop = ["Ah", "7h", "2c"];
    const opponent = combos(["As", "Ks"], ["9c", "9d"]);
    expect(strengthBuckets(flop, combos(["Kh", "Qh"], ["Js", "9d"]), opponent)).toEqual(["draw", "air"]);
    expect(strengthBuckets([...flop, "3s", "8d"], combos(["Kh", "Qh"]), opponent)).toEqual(["air"]);
  });

  it("weights the opponent's combos and skips its own empty ones", () => {
    const board = ["As", "Kd", "7c", "2h", "9s"];
    const opponent: SerializedCombo[] = [
      { cards: ["Kh", "Qh"], weight: 0.1 },
      { cards: ["6h", "5h"], weight: 0.9 },
    ];
    expect(strengthBuckets(board, [{ cards: ["8d", "8s"], weight: 1 }, { cards: ["Ah", "Ad"], weight: 0 }], opponent)).toEqual(["nuts", null]);
  });
});
