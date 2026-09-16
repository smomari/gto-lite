import type { ComboRange } from "@/lib/postflopSolver/types";
import type { EquityTable } from "@/lib/postflopSolver/terminalEquity";
import { canonicalHandOf } from "@/lib/postflopSolver/canonicalHand";
import type { EquityMatrix } from "@/lib/equity/loadEquityMatrix";
import { equityOf } from "@/lib/equity/loadEquityMatrix";

/**
 * Builds an EquityTable (same shape/semantics as terminalEquity.ts's
 * buildEquityTable) from the offline 169x169 all-in matrix instead of a
 * board-based runout enumeration — O(1) lookups, no Monte Carlo, no board.
 *
 * Unlike buildEquityTable, this fills EVERY hero/villain pair unconditionally
 * (no card-removal skip): that's safe here because heroRange/villainRange are
 * expected to come from disjoint suit pools (see canonicalRange.ts), so no
 * pair is ever actually card-blocked in the first place.
 */
export function buildPreflopEquityTable(
  heroRange: ComboRange,
  villainRange: ComboRange,
  matrix: EquityMatrix,
): EquityTable {
  const heroCount = heroRange.length;
  const villainCount = villainRange.length;
  const heroEquity = new Float64Array(heroCount * villainCount);
  const villainEquity = new Float64Array(villainCount * heroCount);

  for (let i = 0; i < heroCount; i++) {
    const heroHand = canonicalHandOf(heroRange[i].cards);
    for (let j = 0; j < villainCount; j++) {
      const equity = equityOf(matrix, heroHand, canonicalHandOf(villainRange[j].cards));
      heroEquity[i * villainCount + j] = equity;
      villainEquity[j * heroCount + i] = 1 - equity;
    }
  }
  return { heroCount, villainCount, heroEquity, villainEquity };
}
