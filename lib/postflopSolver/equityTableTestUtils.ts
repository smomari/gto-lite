import { comboKey } from "@/lib/cards";
import type { EquityTable } from "./terminalEquity";
import type { ComboRange } from "./types";

/** Direct hero-perspective lookup by range index. Test-only. */
export function equityAt(table: EquityTable, heroIdx: number, villainIdx: number): number {
  return table.heroEquity[heroIdx * table.villainCount + villainIdx];
}

/**
 * Test-only: builds an `EquityTable` from a `"heroKey|villainKey" -> equity`
 * fixture map. Only pairs present (in either direction) get filled; anything
 * else stays a blocked (NaN) pair.
 */
export function equityTableFromEntries(
  heroRange: ComboRange,
  villainRange: ComboRange,
  entries: Map<string, number>,
): EquityTable {
  const heroCount = heroRange.length;
  const villainCount = villainRange.length;
  const heroEquity = new Float64Array(heroCount * villainCount).fill(NaN);
  const villainEquity = new Float64Array(villainCount * heroCount).fill(NaN);

  for (let i = 0; i < heroCount; i++) {
    for (let j = 0; j < villainCount; j++) {
      const h = heroRange[i];
      const v = villainRange[j];
      let equity = entries.get(`${comboKey(h.cards)}|${comboKey(v.cards)}`);
      if (equity === undefined) {
        const reverse = entries.get(`${comboKey(v.cards)}|${comboKey(h.cards)}`);
        if (reverse !== undefined) equity = 1 - reverse;
      }
      if (equity !== undefined) {
        heroEquity[i * villainCount + j] = equity;
        villainEquity[j * heroCount + i] = 1 - equity;
      }
    }
  }
  return { heroCount, villainCount, heroEquity, villainEquity };
}
