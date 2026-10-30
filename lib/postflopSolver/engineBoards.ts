import { handRank } from "./handEval";
import { buildEquityTable, type EquityTable } from "./terminalEquity";
import type { ComboRange } from "./types";

/** Above phe's largest rank (7462), so every real hand maps to a positive strength. */
const STRENGTH_BASE = 10000;

function overlapsBoard(cards: [string, string], board: Set<string>): boolean {
  return board.has(cards[0]) || board.has(cards[1]);
}

/**
 * Each combo's river hand strength for the C++ engine (bigger = better; phe's
 * rank is smaller-is-better). Combos holding a board card get 0 — in a
 * multi-street tree the dealt card zeroes their reach, so the value is unused.
 */
export function riverStrengths(range: ComboRange, board: string[]): Uint32Array {
  const boardSet = new Set(board);
  return Uint32Array.from(range, ({ cards }) =>
    overlapsBoard(cards, boardSet) ? 0 : STRENGTH_BASE - handRank([...cards, ...board]),
  );
}

/**
 * Hero-vs-villain equity on a board with cards still to come, laid out as the
 * engine reads it: [hero * villainCount + villain], 0 for card-blocked pairs
 * and for combos holding a board card. Built over the combos the board leaves
 * possible, or taken from `prebuilt` when that table already covers exactly
 * these ranges on this board (the solve's own root table).
 */
export function engineEquityTable(
  hero: ComboRange,
  villain: ComboRange,
  board: string[],
  prebuilt?: EquityTable,
): Float32Array {
  const out = new Float32Array(hero.length * villain.length);
  const boardSet = new Set(board);
  const heroLive = hero.flatMap((c, i) => (overlapsBoard(c.cards, boardSet) ? [] : [i]));
  const villainLive = villain.flatMap((c, j) => (overlapsBoard(c.cards, boardSet) ? [] : [j]));
  const table =
    prebuilt && heroLive.length === hero.length && villainLive.length === villain.length
      ? prebuilt
      : buildEquityTable(heroLive.map((i) => hero[i]), villainLive.map((j) => villain[j]), board);

  for (let a = 0; a < heroLive.length; a++) {
    for (let b = 0; b < villainLive.length; b++) {
      const equity = table.heroEquity[a * villainLive.length + b];
      if (!Number.isNaN(equity)) out[heroLive[a] * villain.length + villainLive[b]] = equity;
    }
  }
  return out;
}
