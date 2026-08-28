import { describe, expect, it } from "vitest";
import { ALL_HANDS } from "@/lib/handRange/handList";
import { loadEquityMatrix } from "@/lib/equity/loadEquityMatrix";
import { computePercentileRanking } from "@/lib/equity/handStrength";
import {
  generateRfiScenario,
  generateThreeWayScenario,
  generateVs3BetScenario,
} from "./generateScenario";
import { RFI_THRESHOLD, VS_OPEN_CONTINUE_THRESHOLD, VS_OPEN_RAISE_FRACTION } from "./config";

const ranking = computePercentileRanking(loadEquityMatrix());

function comboWeightedOpenFrequency(hands: ReturnType<typeof generateRfiScenario>): number {
  const byHand = new Map(ALL_HANDS.map((h) => [h.hand, h.combos]));
  return hands.reduce((sum, hf) => sum + hf.raise * (byHand.get(hf.hand) ?? 0), 0);
}

describe("generateRfiScenario", () => {
  it("has 169 entries with fold+call+raise summing to ~1", () => {
    const hands = generateRfiScenario(ranking, RFI_THRESHOLD.CO!);
    expect(hands).toHaveLength(169);
    for (const h of hands) {
      expect(h.fold + h.call + h.raise).toBeCloseTo(1, 6);
    }
  });

  it("opens AA and never opens 72o", () => {
    const hands = generateRfiScenario(ranking, RFI_THRESHOLD.CO!);
    const byHand = new Map(hands.map((h) => [h.hand, h]));
    expect(byHand.get("AA")!.raise).toBeCloseTo(1, 6);
    expect(byHand.get("72o")!.raise).toBeCloseTo(0, 6);
  });

  it("opens a monotonically wider range UTG < CO < BTN", () => {
    const utg = comboWeightedOpenFrequency(generateRfiScenario(ranking, RFI_THRESHOLD.UTG!));
    const co = comboWeightedOpenFrequency(generateRfiScenario(ranking, RFI_THRESHOLD.CO!));
    const btn = comboWeightedOpenFrequency(generateRfiScenario(ranking, RFI_THRESHOLD.BTN!));
    expect(utg).toBeLessThan(co);
    expect(co).toBeLessThan(btn);
  });
});

describe("generateThreeWayScenario (vs-open)", () => {
  const hands = generateThreeWayScenario(
    ranking,
    VS_OPEN_CONTINUE_THRESHOLD.BTN!,
    VS_OPEN_RAISE_FRACTION,
  );

  it("sums to ~1 for every hand", () => {
    for (const h of hands) {
      expect(h.fold + h.call + h.raise).toBeCloseTo(1, 6);
    }
  });

  it("3-bets the top of the range and calls a wider band beneath it", () => {
    const byHand = new Map(hands.map((h) => [h.hand, h]));
    expect(byHand.get("AA")!.raise).toBeGreaterThan(0.9);
    expect(byHand.get("72o")!.fold).toBeGreaterThan(0.9);
  });
});

describe("generateVs3BetScenario", () => {
  it("produces a tighter continuing range than vs-open at the same position shape", () => {
    const vsOpen = generateThreeWayScenario(ranking, 0.3, 0.35);
    const vs3bet = generateVs3BetScenario(ranking, 0.1, 0.3);
    const continuing = (hands: typeof vsOpen) =>
      hands.reduce((sum, h) => sum + (1 - h.fold), 0);
    expect(continuing(vs3bet)).toBeLessThan(continuing(vsOpen));
  });
});
