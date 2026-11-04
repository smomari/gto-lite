import { describe, expect, it } from "vitest";
import { loadEquityMatrix } from "@/lib/equity/loadEquityMatrix";
import { HAND_BY_LABEL, ALL_HANDS } from "@/lib/handRange/handList";
import { DEFAULT_REALIZATION, equityTable, flopShareTable, HAND_COUNT, otherSide, RAW_EQUITY } from "./realization";

const equity = equityTable(loadEquityMatrix());
const index = (hand: string) => ALL_HANDS.indexOf(HAND_BY_LABEL.get(hand)!);
const at = (table: Float64Array, a: string, b: string) => table[index(a) * HAND_COUNT + index(b)];

describe("realization", () => {
  it("evens the equity matrix out so each matchup adds to one", () => {
    expect(at(equity, "AA", "KK") + at(equity, "KK", "AA")).toBeCloseTo(1, 12);
    expect(at(equity, "QQ", "QQ")).toBeCloseTo(0.5, 12);
  });

  it("splits every flop pot so the two shares add to one", () => {
    const ip = flopShareTable(equity, 5, true, DEFAULT_REALIZATION);
    const oop = otherSide(ip);
    for (const [a, b] of [["AA", "72o"], ["T9s", "AKo"], ["22", "J8s"]]) expect(at(ip, a, b) + at(oop, b, a)).toBeCloseTo(1, 12);
  });

  it("is raw equity without factors, and all-in", () => {
    expect(at(flopShareTable(equity, 5, true, RAW_EQUITY), "AKo", "T9s")).toBeCloseTo(at(equity, "AKo", "T9s"), 12);
    expect(at(flopShareTable(equity, 0, true, DEFAULT_REALIZATION), "AKo", "T9s")).toBeCloseTo(at(equity, "AKo", "T9s"), 12);
  });

  it("favors position, suited and connected hands, and the deeper the more", () => {
    const shallow = flopShareTable(equity, 1, true, DEFAULT_REALIZATION);
    const deep = flopShareTable(equity, 10, true, DEFAULT_REALIZATION);
    expect(at(deep, "QQ", "QQ")).toBeGreaterThan(at(shallow, "QQ", "QQ"));
    expect(at(shallow, "QQ", "QQ")).toBeGreaterThan(0.5);
    expect(at(deep, "T9s", "T9o")).toBeGreaterThan(at(deep, "T9o", "T9s"));
    expect(at(deep, "T9o", "T5o")).toBeGreaterThan(at(equity, "T9o", "T5o"));
  });

  it("shrinks a weak hand's share and grows a strong one's", () => {
    const flat = { ...DEFAULT_REALIZATION, oopPenalty: 0, suitedBonus: 0, connectorBonus: 0, initiativeBonus: 0 };
    const table = flopShareTable(equity, 20, true, flat);
    expect(at(table, "72o", "AKs")).toBeLessThan(at(equity, "72o", "AKs"));
    expect(at(table, "AKs", "72o")).toBeGreaterThan(at(equity, "AKs", "72o"));
  });
});
