import { describe, expect, it } from "vitest";
import { computePlayabilityRanking } from "@/lib/equity/handStrength";
import { loadEquityMatrix } from "@/lib/equity/loadEquityMatrix";
import { ALL_HANDS, HAND_BY_LABEL, TOTAL_COMBOS } from "@/lib/handRange/handList";
import type { FrequencyMap } from "@/lib/nashSolver/pushFoldSolver";
import { NO_RAKE } from "@/lib/solveEngine/rake";
import type { HandFrequency } from "@/types/rangeData";
import { generateCallShoveScenario, generateVsReraiseScenario, type VsReraiseParams } from "./vsReraise";

const matrix = loadEquityMatrix();
const ranking = computePlayabilityRanking(matrix);
const range = (hands: string): FrequencyMap => new Map(hands.split(" ").map((hand) => [hand, 1]));
const combosOf = (map: FrequencyMap) => [...map].reduce((sum, [hand, freq]) => sum + freq * HAND_BY_LABEL.get(hand)!.combos, 0);

const OPENER = "AA KK QQ JJ TT 99 88 77 66 55 AKs AQs AJs ATs A9s A5s KQs KJs KTs QJs QTs JTs T9s 98s 87s AKo AQo AJo ATo KQo KJo QJo";
const WIDE_THREE_BET = "AA KK QQ JJ TT 99 AKs AQs AJs ATs KQs KJs AKo AQo AJo A5s A4s A3s 76s 65s 54s";
const TIGHT_THREE_BET = "AA KK QQ AKs AKo A5s";

const base: VsReraiseParams = {
  heroRange: range(OPENER),
  villainRange: range(WIDE_THREE_BET),
  isIP: true,
  potBb: 13,
  amountOwedBb: 7.5,
  raiseWidth: 0.04,
  rake: NO_RAKE,
};
const continuing = (hands: HandFrequency[]) => hands.reduce((sum, h) => sum + (1 - h.fold) * HAND_BY_LABEL.get(h.hand)!.combos, 0);
const solve = (overrides: Partial<VsReraiseParams> = {}) => generateVsReraiseScenario(matrix, ranking, { ...base, ...overrides });

describe("generateVsReraiseScenario", () => {
  it("gives every hand frequencies that sum to 1", () => {
    const hands = solve();
    expect(hands).toHaveLength(ALL_HANDS.length);
    for (const h of hands) {
      expect(h.fold + h.call + h.raise).toBeCloseTo(1, 9);
      expect(Math.min(h.fold, h.call, h.raise)).toBeGreaterThanOrEqual(0);
    }
  });

  it("folds whatever was never in the range", () => {
    const hands = new Map(solve().map((h) => [h.hand, h]));
    expect(hands.get("72o")!.fold).toBe(1);
    expect(hands.get("A2s")!.fold).toBe(1);
  });

  it("continues only with part of the range, and with its best hands", () => {
    const hands = new Map(solve().map((h) => [h.hand, h]));
    const width = continuing([...hands.values()]);
    expect(width).toBeLessThan(combosOf(base.heroRange));
    expect(hands.get("AA")!.fold).toBe(0);
    expect(hands.get("QJo")!.fold).toBeGreaterThan(hands.get("AKs")!.fold);
  });

  it("re-raises its best hands up to the requested width", () => {
    const hands = solve();
    const raised = hands.reduce((sum, h) => sum + h.raise * HAND_BY_LABEL.get(h.hand)!.combos, 0);
    expect(raised / TOTAL_COMBOS).toBeCloseTo(0.04, 3);
    expect(new Map(hands.map((h) => [h.hand, h])).get("AA")!.raise).toBe(1);
  });

  it("keeps playable hands over ones that only have all-in equity", () => {
    const hands = new Map(solve({ heroRange: range("AA KK AKs 76s K4o") }).map((h) => [h.hand, h]));
    expect(ranking.get("76s")!).toBeLessThan(ranking.get("K4o")!);
    expect(hands.get("76s")!.fold).toBeLessThan(hands.get("K4o")!.fold);
  });

  it("gives up more against a tighter raiser", () => {
    expect(continuing(solve({ villainRange: range(TIGHT_THREE_BET) }))).toBeLessThan(continuing(solve()));
  });

  it("gives up more at a worse price", () => {
    expect(continuing(solve({ amountOwedBb: 12 }))).toBeLessThan(continuing(solve()));
  });

  it("gives up more out of position", () => {
    expect(continuing(solve({ isIP: false }))).toBeLessThan(continuing(solve()));
  });

  it("gives up more under rake", () => {
    expect(continuing(solve({ rake: { rate: 0.1, capBb: 3 } }))).toBeLessThan(continuing(solve()));
  });
});

describe("generateCallShoveScenario", () => {
  const shove = { heroRange: range(OPENER), villainRange: range(WIDE_THREE_BET), potBb: 136, amountOwedBb: 66, rake: NO_RAKE };
  const calling = (overrides = {}) => continuing(generateCallShoveScenario(matrix, { ...shove, ...overrides }));

  it("calls wider the more dead money is in the pot", () => {
    expect(calling()).toBeGreaterThan(calling({ potBb: 70 }));
  });

  it("never calls from outside the range, and never raises", () => {
    const hands = generateCallShoveScenario(matrix, shove);
    expect(hands.find((h) => h.hand === "72o")!.fold).toBe(1);
    expect(hands.every((h) => h.raise === 0)).toBe(true);
    expect(hands.find((h) => h.hand === "AA")!.call).toBe(1);
  });

  it("calls tighter under rake", () => {
    expect(calling({ potBb: 90, rake: { rate: 0.1, capBb: 30 } })).toBeLessThan(calling({ potBb: 90 }));
  });
});
