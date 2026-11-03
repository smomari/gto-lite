import { describe, expect, it } from "vitest";
import { ALL_HANDS, TOTAL_COMBOS } from "@/lib/handRange/handList";
import { loadEquityMatrix } from "@/lib/equity/loadEquityMatrix";
import { computePlayabilityRanking } from "@/lib/equity/handStrength";
import { COLD_CALL_BASE, THREE_BET_WIDTH_RATIO } from "./config";
import {
  generateBbVsLimpScenario,
  generateFacingRaiseScenario,
  generateOpeningScenario,
  generateSbFirstInScenario,
  openWidthFor,
} from "./generateScenario";

const ranking = computePlayabilityRanking(loadEquityMatrix());

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
    const hands = generateOpeningScenario(ranking, 4, 100); // CO
    expect(hands).toHaveLength(169);
    for (const h of hands) {
      expect(h.fold + h.call + h.raise).toBeCloseTo(1, 6);
    }
  });

  it("opens AA everywhere and never opens 72o", () => {
    for (const seatIdx of [0, 2, 4, 6]) {
      const byHand = new Map(generateOpeningScenario(ranking, seatIdx, 100).map((h) => [h.hand, h]));
      expect(byHand.get("AA")!.raise).toBeCloseTo(1, 6);
      expect(byHand.get("72o")!.raise).toBeCloseTo(0, 6);
    }
  });

  it("opens a monotonically wider range UTG(0) < LJ(2) < CO(4) < BTN(5)", () => {
    const utg = comboWeightedRaiseFrequency(generateOpeningScenario(ranking, 0, 100));
    const lj = comboWeightedRaiseFrequency(generateOpeningScenario(ranking, 2, 100));
    const co = comboWeightedRaiseFrequency(generateOpeningScenario(ranking, 4, 100));
    const btn = comboWeightedRaiseFrequency(generateOpeningScenario(ranking, 5, 100));
    expect(utg).toBeLessThan(lj);
    expect(lj).toBeLessThan(co);
    expect(co).toBeLessThan(btn);
  });

  it("opens about the configured share of combos", () => {
    const opened = comboWeightedRaiseFrequency(generateOpeningScenario(ranking, 5, 100));
    expect(opened / TOTAL_COMBOS).toBeCloseTo(openWidthFor(5, 100), 1);
  });

  it("narrows the button from 100bb to 40bb and again by 20bb", () => {
    expect(openWidthFor(5, 40)).toBeLessThan(openWidthFor(5, 100));
    expect(openWidthFor(5, 20)).toBeLessThan(openWidthFor(5, 40));
    expect(openWidthFor(5, 30)).toBeCloseTo((openWidthFor(5, 20) + openWidthFor(5, 40)) / 2, 6);
  });

  it("opens suited connectors and small pairs on the button ahead of weak offsuit kings", () => {
    const byHand = new Map(generateOpeningScenario(ranking, 5, 100).map((h) => [h.hand, h]));
    for (const hand of ["76s", "98s", "22"]) expect(byHand.get(hand)!.raise).toBeGreaterThan(0.9);
    expect(byHand.get("K2o")!.raise).toBe(0);
  });

  it("opens SB (index 6) tighter than BTN (index 5)", () => {
    const btn = comboWeightedRaiseFrequency(generateOpeningScenario(ranking, 5, 100));
    const sb = comboWeightedRaiseFrequency(generateOpeningScenario(ranking, 6, 100));
    expect(sb).toBeLessThan(btn);
  });
});

describe("first-in jams", () => {
  const allinCombos = (hands: ReturnType<typeof generateOpeningScenario>) =>
    hands.reduce((sum, h) => sum + (h.allin ?? 0) * (ALL_HANDS.find((a) => a.hand === h.hand)?.combos ?? 0), 0);

  it("jams nothing at 25bb and more the closer the stack gets to push/fold", () => {
    expect(allinCombos(generateOpeningScenario(ranking, 5, 25))).toBe(0);
    expect(allinCombos(generateOpeningScenario(ranking, 5, 16))).toBeGreaterThan(allinCombos(generateOpeningScenario(ranking, 5, 20)));
    expect(allinCombos(generateOpeningScenario(ranking, 5, 20))).toBeGreaterThan(0);
  });

  it("keeps premiums raising and leaves the frequencies summing to 1", () => {
    const hands = generateOpeningScenario(ranking, 5, 16);
    expect(hands.find((h) => h.hand === "AA")!.allin ?? 0).toBe(0);
    for (const h of hands) expect(h.fold + h.call + h.raise + (h.allin ?? 0)).toBeCloseTo(1, 6);
  });

  it("applies to SB's raises too, not its limps", () => {
    const hands = generateSbFirstInScenario(ranking, 18);
    expect(allinCombos(hands)).toBeGreaterThan(0);
    for (const h of hands) expect(h.fold + h.call + h.raise + (h.allin ?? 0)).toBeCloseTo(1, 6);
    expect(hands.find((h) => h.hand === "76s")!.allin ?? 0).toBe(0);
  });
});

describe("generateSbFirstInScenario", () => {
  it("raises the top, limps the middle, folds the bottom", () => {
    const hands = generateSbFirstInScenario(ranking, 40);
    const byHand = new Map(hands.map((h) => [h.hand, h]));
    for (const h of hands) expect(h.fold + h.call + h.raise).toBeCloseTo(1, 6);
    expect(byHand.get("AA")!.raise).toBe(1);
    expect(byHand.get("76s")!.call).toBe(1);
    expect(byHand.get("72o")!.fold).toBe(1);
  });

  it("raises more at 40bb than at 100bb", () => {
    expect(comboWeightedRaiseFrequency(generateSbFirstInScenario(ranking, 40))).toBeGreaterThan(
      comboWeightedRaiseFrequency(generateSbFirstInScenario(ranking, 100)),
    );
  });
});

describe("generateBbVsLimpScenario", () => {
  it("raises value and suited bluffs, checks the rest, and never folds", () => {
    const hands = generateBbVsLimpScenario(ranking);
    const byHand = new Map(hands.map((h) => [h.hand, h]));
    for (const h of hands) {
      expect(h.fold).toBe(0);
      expect(h.call + h.raise).toBeCloseTo(1, 6);
    }
    expect(byHand.get("AA")!.raise).toBe(1);
    expect(byHand.get("54s")!.raise).toBe(1);
    expect(byHand.get("72o")!.call).toBe(1);
  });
});

describe("generateFacingRaiseScenario", () => {
  const base = {
    raiseDepth: 1,
    isIP: true,
    potBb: 5,
    amountOwedBb: 2,
    aggressorOpenWidth: 0.3,
    seatsBehind: 2,
    threeBetWidthRatio: THREE_BET_WIDTH_RATIO,
    coldCallBase: COLD_CALL_BASE,
    continueFactor: 1,
    coldCallOopMultiplier: 0.6,
    callFactor: 1,
    closingContinueFactor: 1,
  };

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
    const deep = continuingCombos(generateFacingRaiseScenario(ranking, { ...base, raiseDepth: 2 }));
    expect(deep).toBeLessThan(shallow);
  });

  it("continues wider in position than out of position, all else equal", () => {
    const ip = continuingCombos(generateFacingRaiseScenario(ranking, { ...base, isIP: true }));
    const oop = continuingCombos(generateFacingRaiseScenario(ranking, { ...base, isIP: false }));
    expect(ip).toBeGreaterThan(oop);
  });

  it("defends far wider when closing the action than with seats behind", () => {
    const closing = continuingCombos(generateFacingRaiseScenario(ranking, { ...base, isIP: false, seatsBehind: 0 }));
    const coldCalling = continuingCombos(generateFacingRaiseScenario(ranking, base));
    expect(closing).toBeGreaterThan(coldCalling * 1.5);
  });

  it("continues wider against a wider opener, and 3-bets it more", () => {
    const vsTight = generateFacingRaiseScenario(ranking, { ...base, aggressorOpenWidth: 0.13 });
    const vsLoose = generateFacingRaiseScenario(ranking, { ...base, aggressorOpenWidth: 0.46 });
    expect(continuingCombos(vsLoose)).toBeGreaterThan(continuingCombos(vsTight));
    expect(comboWeightedRaiseFrequency(vsLoose)).toBeGreaterThan(comboWeightedRaiseFrequency(vsTight) * 2);
  });

  it("3-bets suited bluffs alongside value, not just the next-best hands", () => {
    const byHand = new Map(generateFacingRaiseScenario(ranking, { ...base, aggressorOpenWidth: 0.46 }).map((h) => [h.hand, h]));
    expect(byHand.get("A5s")!.raise).toBe(1);
    expect(byHand.get("AA")!.raise).toBe(1);
    expect(byHand.get("KJo")!.raise).toBe(0);
  });

  it("keeps every frequency in [0, 1] when the 3-bet range is as wide as the continuing range", () => {
    for (const h of generateFacingRaiseScenario(ranking, { ...base, aggressorOpenWidth: 0.05, seatsBehind: 6, isIP: false, amountOwedBb: 10 })) {
      expect(h.fold).toBeGreaterThanOrEqual(-1e-9);
      expect(h.call).toBeGreaterThanOrEqual(0);
      expect(h.fold + h.call + h.raise).toBeCloseTo(1, 6);
    }
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

  it("flats less under continueFactor but keeps the 3-bet range", () => {
    const full = generateFacingRaiseScenario(ranking, { ...base, seatsBehind: 0 });
    const raked = generateFacingRaiseScenario(ranking, { ...base, seatsBehind: 0, continueFactor: 0.85 });
    expect(continuingCombos(raked)).toBeLessThan(continuingCombos(full));
    expect(raked.map((h) => h.raise)).toEqual(full.map((h) => h.raise));
  });
});
