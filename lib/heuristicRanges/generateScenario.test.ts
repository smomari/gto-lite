import { describe, expect, it } from "vitest";
import { ALL_HANDS } from "@/lib/handRange/handList";
import { loadEquityMatrix } from "@/lib/equity/loadEquityMatrix";
import { computePercentileRanking } from "@/lib/equity/handStrength";
import { generateOpeningScenario, generateFacingRaiseScenario } from "./generateScenario";

const ranking = computePercentileRanking(loadEquityMatrix());

function comboWeightedRaiseFrequency(hands: ReturnType<typeof generateOpeningScenario>): number {
  const byHand = new Map(ALL_HANDS.map((h) => [h.hand, h.combos]));
  return hands.reduce((sum, hf) => sum + hf.raise * (byHand.get(hf.hand) ?? 0), 0);
}

function continuingCombos(hands: ReturnType<typeof generateOpeningScenario>): number {
  const byHand = new Map(ALL_HANDS.map((h) => [h.hand, h.combos]));
  return hands.reduce((sum, hf) => sum + (1 - hf.fold) * (byHand.get(hf.hand) ?? 0), 0);
}

describe("generateOpeningScenario", () => {
  it("has 169 entries with fold+call+raise summing to ~1", () => {
    const hands = generateOpeningScenario(ranking, 4); // CO
    expect(hands).toHaveLength(169);
    for (const h of hands) {
      expect(h.fold + h.call + h.raise).toBeCloseTo(1, 6);
    }
  });

  it("opens AA everywhere and never opens 72o", () => {
    for (const seatIdx of [0, 2, 4, 6]) {
      const byHand = new Map(generateOpeningScenario(ranking, seatIdx).map((h) => [h.hand, h]));
      expect(byHand.get("AA")!.raise).toBeCloseTo(1, 6);
      expect(byHand.get("72o")!.raise).toBeCloseTo(0, 6);
    }
  });

  it("opens a monotonically wider range UTG(0) < LJ(2) < CO(4) < BTN(5)", () => {
    const utg = comboWeightedRaiseFrequency(generateOpeningScenario(ranking, 0));
    const lj = comboWeightedRaiseFrequency(generateOpeningScenario(ranking, 2));
    const co = comboWeightedRaiseFrequency(generateOpeningScenario(ranking, 4));
    const btn = comboWeightedRaiseFrequency(generateOpeningScenario(ranking, 5));
    expect(utg).toBeLessThan(lj);
    expect(lj).toBeLessThan(co);
    expect(co).toBeLessThan(btn);
  });

  it("opens SB (index 6) tighter than BTN (index 5)", () => {
    const btn = comboWeightedRaiseFrequency(generateOpeningScenario(ranking, 5));
    const sb = comboWeightedRaiseFrequency(generateOpeningScenario(ranking, 6));
    expect(sb).toBeLessThan(btn);
  });
});

describe("generateFacingRaiseScenario", () => {
  const base = { raiseDepth: 1, isIP: true, potBb: 5, amountOwedBb: 2 };

  it("has 169 entries with fold+call+raise summing to ~1", () => {
    const hands = generateFacingRaiseScenario(ranking, base);
    expect(hands).toHaveLength(169);
    for (const h of hands) {
      expect(h.fold + h.call + h.raise).toBeCloseTo(1, 6);
    }
  });

  it("re-raises the top of the range and folds the bottom", () => {
    const byHand = new Map(generateFacingRaiseScenario(ranking, base).map((h) => [h.hand, h]));
    expect(byHand.get("AA")!.raise).toBeGreaterThan(0.5);
    expect(byHand.get("72o")!.fold).toBeGreaterThan(0.9);
  });

  it("tightens the continuing range as raise depth increases", () => {
    const shallow = continuingCombos(generateFacingRaiseScenario(ranking, { ...base, raiseDepth: 1 }));
    const deep = continuingCombos(generateFacingRaiseScenario(ranking, { ...base, raiseDepth: 3 }));
    expect(deep).toBeLessThan(shallow);
  });

  it("continues wider in position than out of position, all else equal", () => {
    const ip = continuingCombos(generateFacingRaiseScenario(ranking, { ...base, isIP: true }));
    const oop = continuingCombos(generateFacingRaiseScenario(ranking, { ...base, isIP: false }));
    expect(ip).toBeGreaterThan(oop);
  });

  it("widens the continuing range with better pot odds (bigger pot for the same call) — this is how the BB ante flows through", () => {
    const worseOdds = continuingCombos(
      generateFacingRaiseScenario(ranking, { ...base, potBb: 3, amountOwedBb: 2 }),
    );
    const betterOdds = continuingCombos(
      generateFacingRaiseScenario(ranking, { ...base, potBb: 6, amountOwedBb: 2 }),
    );
    expect(betterOdds).toBeGreaterThan(worseOdds);
  });
});
