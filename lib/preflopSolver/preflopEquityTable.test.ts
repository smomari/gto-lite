import { describe, expect, it } from "vitest";
import { loadEquityMatrix, equityOf } from "@/lib/equity/loadEquityMatrix";
import { canonicalHandOf } from "@/lib/postflopSolver/canonicalHand";
import { equityAt } from "@/lib/postflopSolver/terminalEquity";
import { canonicalRfiRange, HERO_SUITS, VILLAIN_SUITS } from "./canonicalRange";
import { buildPreflopEquityTable } from "./preflopEquityTable";

describe("buildPreflopEquityTable", () => {
  const matrix = loadEquityMatrix();
  const heroRange = canonicalRfiRange(HERO_SUITS);
  const villainRange = canonicalRfiRange(VILLAIN_SUITS);
  const table = buildPreflopEquityTable(heroRange, villainRange, matrix);

  it("has an entry for every hero/villain pair, matching the 169x169 matrix directly", () => {
    expect(table.heroCount * table.villainCount).toBe(169 * 169);
    const aaIdx = heroRange.findIndex((c) => canonicalHandOf(c.cards) === "AA");
    const kkIdx = villainRange.findIndex((c) => canonicalHandOf(c.cards) === "KK");
    expect(equityAt(table, aaIdx, kkIdx)).toBeCloseTo(equityOf(matrix, "AA", "KK"), 9);
  });

  it("resolves same-hand pairs (e.g. AA vs AA) via the real matrix value, not a card-removal-skip fallback", () => {
    const aaHeroIdx = heroRange.findIndex((c) => canonicalHandOf(c.cards) === "AA");
    const aaVillainIdx = villainRange.findIndex((c) => canonicalHandOf(c.cards) === "AA");
    const value = equityAt(table, aaHeroIdx, aaVillainIdx);
    expect(value).toBeCloseTo(equityOf(matrix, "AA", "AA"), 9);
    expect(value).toBeDefined();
  });
});
