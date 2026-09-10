import type { ComboRange } from "@/lib/postflopSolver/types";
import type { EquityTable } from "@/lib/postflopSolver/terminalEquity";
import { comboKey } from "@/lib/postflopSolver/terminalEquity";
import { canonicalHandOf } from "@/lib/postflopSolver/canonicalHand";
import type { EquityMatrix } from "@/lib/equity/loadEquityMatrix";
import { equityOf } from "@/lib/equity/loadEquityMatrix";

/**
 * Builds an EquityTable (same shape/semantics as terminalEquity.ts's
 * buildEquityTable) from the offline 169x169 all-in matrix instead of a
 * board-based runout enumeration — O(1) lookups, no Monte Carlo, no board.
 *
 * Unlike buildEquityTable, this fills EVERY hero/villain pair unconditionally
 * (no card-removal skip): terminalEquity.ts's lookupEquity throws on a
 * missing key rather than falling back to computing on the fly, so the table
 * must be exhaustive. That's safe here because heroRange/villainRange are
 * expected to come from disjoint suit pools (see canonicalRange.ts), so no
 * pair is ever actually card-blocked in the first place.
 */
export function buildPreflopEquityTable(
  heroRange: ComboRange,
  villainRange: ComboRange,
  matrix: EquityMatrix,
): EquityTable {
  const table: EquityTable = new Map();
  for (const h of heroRange) {
    for (const v of villainRange) {
      const key = `${comboKey(h.cards)}|${comboKey(v.cards)}`;
      if (table.has(key)) continue;
      table.set(key, equityOf(matrix, canonicalHandOf(h.cards), canonicalHandOf(v.cards)));
    }
  }
  return table;
}
