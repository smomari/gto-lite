import { describe, expect, it } from "vitest";
import { loadEquityMatrix, equityOf } from "@/lib/equity/loadEquityMatrix";
import { canonicalHandOf } from "@/lib/postflopSolver/canonicalHand";
import { canonicalRfiRange, HERO_SUITS, VILLAIN_SUITS } from "./canonicalRange";
import { buildPreflopEquityTable } from "./preflopEquityTable";

function tableKey(a: [string, string], b: [string, string]): string {
  return `${[...a].sort().join("")}|${[...b].sort().join("")}`;
}

describe("buildPreflopEquityTable", () => {
  const matrix = loadEquityMatrix();
  const heroRange = canonicalRfiRange(HERO_SUITS);
  const villainRange = canonicalRfiRange(VILLAIN_SUITS);
  const table = buildPreflopEquityTable(heroRange, villainRange, matrix);

  it("has an entry for every hero/villain pair, matching the 169x169 matrix directly", () => {
    expect(table.size).toBe(169 * 169);
    const aa = heroRange.find((c) => canonicalHandOf(c.cards) === "AA")!;
    const kk = villainRange.find((c) => canonicalHandOf(c.cards) === "KK")!;
    expect(table.get(tableKey(aa.cards, kk.cards))).toBeCloseTo(equityOf(matrix, "AA", "KK"), 9);
  });

  it("resolves same-hand pairs (e.g. AA vs AA) via the real matrix value, not a card-removal-skip fallback", () => {
    const aaHero = heroRange.find((c) => canonicalHandOf(c.cards) === "AA")!;
    const aaVillain = villainRange.find((c) => canonicalHandOf(c.cards) === "AA")!;
    const value = table.get(tableKey(aaHero.cards, aaVillain.cards));
    expect(value).toBeCloseTo(equityOf(matrix, "AA", "AA"), 9);
    expect(value).toBeDefined();
  });
});
