import { describe, expect, it } from "vitest";
import { ALL_HANDS } from "@/lib/handRange/handList";
import { dealTwoHands } from "./assignCards";

describe("dealTwoHands", () => {
  it("never collides across all 169x169 canonical hand pairs", () => {
    for (const handA of ALL_HANDS) {
      for (const handB of ALL_HANDS) {
        const { cardsA, cardsB } = dealTwoHands(handA, handB);
        const all = [...cardsA, ...cardsB];
        expect(new Set(all).size).toBe(4);
      }
    }
  });

  it("preserves suitedness for suited hands", () => {
    const ak = ALL_HANDS.find((h) => h.hand === "AKs")!;
    const q7 = ALL_HANDS.find((h) => h.hand === "Q7o")!;
    const { cardsA } = dealTwoHands(ak, q7);
    expect(cardsA[0].at(-1)).toBe(cardsA[1].at(-1));
  });

  it("preserves offsuitness for offsuit hands", () => {
    const ak = ALL_HANDS.find((h) => h.hand === "AKo")!;
    const q7 = ALL_HANDS.find((h) => h.hand === "Q7s")!;
    const { cardsA } = dealTwoHands(ak, q7);
    expect(cardsA[0].at(-1)).not.toBe(cardsA[1].at(-1));
  });
});
