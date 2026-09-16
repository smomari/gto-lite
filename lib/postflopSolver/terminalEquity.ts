import { compareHands, handRank } from "./handEval";
import type { ComboRange } from "./types";
import type { PostflopPlayer } from "./potState";

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
const SUITS = ["s", "h", "d", "c"];
export const FULL_DECK = RANKS.flatMap((r) => SUITS.map((s) => `${r}${s}`));

const CARD_INDEX: Record<string, number> = Object.fromEntries(FULL_DECK.map((c, i) => [c, i]));
const DECK_SIZE = FULL_DECK.length; // 52
/** Number of unordered 2-card combos from a 52-card deck: C(52,2). */
const PAIR_COUNT = (DECK_SIZE * (DECK_SIZE - 1)) / 2; // 1326

/** Stable 0..1325 index for an unordered pair of cards, independent of board/combo — used to align two combos' precomputed runout-rank arrays for a fast intersection scan (no string hashing). */
function pairIndex(a: string, b: string): number {
  const ia = CARD_INDEX[a];
  const ib = CARD_INDEX[b];
  const lo = Math.min(ia, ib);
  const hi = Math.max(ia, ib);
  return lo * DECK_SIZE - (lo * (lo + 1)) / 2 + (hi - lo - 1);
}

export function remainingDeck(used: string[]): string[] {
  const usedSet = new Set(used);
  return FULL_DECK.filter((c) => !usedSet.has(c));
}

/** Every `count`-card combination of `deck`, in stable index order. */
function enumerateRunouts(deck: string[], count: number): string[][] {
  if (count === 0) return [[]];
  const result: string[][] = [];
  const chosen: string[] = [];
  function recurse(start: number) {
    if (chosen.length === count) {
      result.push([...chosen]);
      return;
    }
    for (let i = start; i < deck.length; i++) {
      chosen.push(deck[i]);
      recurse(i + 1);
      chosen.pop();
    }
  }
  recurse(0);
  return result;
}

/**
 * Exact equity of heroCombo vs villainCombo on a fixed board, enumerating
 * every possible completion to a 5-card board — not Monte Carlo. A 3-card
 * (flop) board enumerates every turn+river pair (C(45,2) = 990 runouts); a
 * 4-card (turn) board enumerates every single river card. Every non-fold
 * terminal's value is a runout equity this way, computed identically
 * regardless of whether it was reached via check-check, bet-call, or an
 * all-in.
 *
 * This is the slow, naive O(runouts) reference implementation — kept
 * unchanged as an independent correctness oracle for tests. `buildEquityTable`
 * itself uses a much faster precompute-then-compare algorithm (see below);
 * this function is not on that hot path.
 */
export function comboVsComboRunoutEquity(
  heroCombo: [string, string],
  villainCombo: [string, string],
  board: string[],
): number {
  const remaining = 5 - board.length;
  if (remaining < 0 || remaining > 2) {
    throw new Error(`comboVsComboRunoutEquity: unsupported board length ${board.length} (expected 3, 4, or 5 cards)`);
  }

  const deck = remainingDeck([...heroCombo, ...villainCombo, ...board]);
  const runouts = enumerateRunouts(deck, remaining);
  let wins = 0;
  let ties = 0;

  for (const extra of runouts) {
    const fullBoard = [...board, ...extra];
    const cmp = compareHands([...heroCombo, ...fullBoard], [...villainCombo, ...fullBoard]);
    if (cmp > 0) wins++;
    else if (cmp === 0) ties++;
  }

  return (wins + ties * 0.5) / runouts.length;
}

export function comboKey(cards: [string, string]): string {
  return [...cards].sort().join("");
}

function shareCard(a: [string, string], b: [string, string]): boolean {
  return a.includes(b[0]) || a.includes(b[1]);
}

/**
 * A combo's hand rank across every runout not blocked by the combo alone
 * (board + the combo's own 2 cards removed) — independent of any specific
 * opponent combo. Indexed by a stable numeric runout identity so two
 * combos' arrays can be intersected with plain numeric array access, no
 * string keys:
 *  - river board (remaining 0): a single-slot array, the combo's exact rank.
 *  - turn board (remaining 1): indexed by `CARD_INDEX[riverCard]` (0..51).
 *  - flop board (remaining 2): indexed by `pairIndex(turnCard, riverCard)` (0..1325).
 * NaN marks a slot that isn't a valid runout for this combo (e.g. it uses
 * one of the combo's own cards).
 */
function computeComboRanks(combo: [string, string], board: string[]): Float64Array {
  const remaining = 5 - board.length;
  if (remaining < 0 || remaining > 2) {
    throw new Error(`computeComboRanks: unsupported board length ${board.length} (expected 3, 4, or 5 cards)`);
  }

  if (remaining === 0) {
    return Float64Array.of(handRank([...combo, ...board]));
  }

  const deck = remainingDeck([...combo, ...board]);

  if (remaining === 1) {
    const ranks = new Float64Array(DECK_SIZE).fill(NaN);
    for (const card of deck) {
      ranks[CARD_INDEX[card]] = handRank([...combo, ...board, card]);
    }
    return ranks;
  }

  const ranks = new Float64Array(PAIR_COUNT).fill(NaN);
  for (let x = 0; x < deck.length; x++) {
    for (let y = x + 1; y < deck.length; y++) {
      ranks[pairIndex(deck[x], deck[y])] = handRank([...combo, ...board, deck[x], deck[y]]);
    }
  }
  return ranks;
}

/**
 * Equity from two combos' precomputed rank arrays (same board, so same
 * indexing/length) — a plain numeric intersection scan, zero evaluator
 * calls. `handRank`'s convention is smaller-is-better (see handEval.ts).
 */
function equityFromRankTables(heroRanks: Float64Array, villainRanks: Float64Array): number {
  let wins = 0;
  let ties = 0;
  let total = 0;
  for (let k = 0; k < heroRanks.length; k++) {
    const hr = heroRanks[k];
    if (Number.isNaN(hr)) continue;
    const vr = villainRanks[k];
    if (Number.isNaN(vr)) continue;
    total++;
    if (hr < vr) wins++;
    else if (hr === vr) ties++;
  }
  return total > 0 ? (wins + ties * 0.5) / total : 0.5;
}

/**
 * Precomputed hero-combo-vs-villain-combo runout equities for one fixed
 * board. Built once per solve, reused across all CFR iterations. Flat,
 * index-aligned to `heroRange`/`villainRange`'s own array order (position i
 * in the range == index i here) — every consumer (cfr.ts, exploitability.ts,
 * checkdownEquity.ts) already receives the same range arrays from
 * solvePostflop.ts/solveRfi.ts, so no separate key/index mapping is needed.
 * `villainEquity` is `heroEquity`'s transpose (`1 - equity` at the same
 * pair), precomputed so both perspectives get contiguous-row access.
 * NaN marks a card-blocked (impossible) pair.
 */
export interface EquityTable {
  heroCount: number;
  villainCount: number;
  /** [heroIdx*villainCount+villainIdx] = hero's equity (win + 0.5*tie) vs that villain combo. */
  heroEquity: Float64Array;
  /** [villainIdx*heroCount+heroIdx] = villain's equity vs that hero combo. */
  villainEquity: Float64Array;
}

/**
 * Builds the full pairwise equity table for two ranges on a fixed board,
 * skipping card-blocked (impossible) pairs.
 *
 * Algorithm: a combo's hand rank for a given runout depends only on (that
 * combo, board, runout) — not on the opponent — so each combo's rank is
 * precomputed once across all its valid runouts (`computeComboRanks`, one
 * evaluator call per combo per runout), and each pair's equity then comes
 * from comparing two already-computed rank arrays (`equityFromRankTables`,
 * zero evaluator calls). This turns the evaluator-call count from
 * O(comboPairs * runouts) into O(combos * runouts) — for a typical flop
 * range (~150 combos/side) this is roughly a 100x+ reduction versus calling
 * `comboVsComboRunoutEquity` per pair.
 */
export function buildEquityTable(
  heroRange: ComboRange,
  villainRange: ComboRange,
  board: string[],
  onProgress?: (done: number, total: number) => void,
): EquityTable {
  const heroCount = heroRange.length;
  const villainCount = villainRange.length;
  const heroRanks = heroRange.map((c) => computeComboRanks(c.cards, board));
  const villainRanks = villainRange.map((c) => computeComboRanks(c.cards, board));

  const heroEquity = new Float64Array(heroCount * villainCount).fill(NaN);
  const villainEquity = new Float64Array(villainCount * heroCount).fill(NaN);

  const total = heroCount * villainCount;
  let done = 0;
  for (let i = 0; i < heroCount; i++) {
    const h = heroRange[i];
    for (let j = 0; j < villainCount; j++) {
      done++;
      const v = villainRange[j];
      if (!shareCard(h.cards, v.cards)) {
        const equity = equityFromRankTables(heroRanks[i], villainRanks[j]);
        heroEquity[i * villainCount + j] = equity;
        villainEquity[j * heroCount + i] = 1 - equity;
      }
      if (onProgress && done % 200 === 0) onProgress(done, total);
    }
  }
  onProgress?.(total, total);
  return { heroCount, villainCount, heroEquity, villainEquity };
}

/**
 * `target`'s combo (`targetIdx`, an index into its own range array) equity
 * against a (reach-weighted) opponent range, card-removal corrected: any
 * opponent combo blocked by target's cards is excluded from both the
 * numerator and the weight total, not just zeroed out — otherwise the
 * equity would be diluted by combos that can't actually be in play.
 * `opponentReach` must be a plain weight array positionally aligned to the
 * opponent's own range (exactly what cfr.ts/exploitability.ts already carry
 * as reachP1/reachP2 — no wrapper objects needed).
 */
export function equityVsRange(
  table: EquityTable,
  target: PostflopPlayer,
  targetIdx: number,
  opponentReach: number[],
): number {
  const equities = target === "P1" ? table.heroEquity : table.villainEquity;
  const opponentCount = target === "P1" ? table.villainCount : table.heroCount;
  const base = targetIdx * opponentCount;

  let weighted = 0;
  let totalWeight = 0;
  for (let k = 0; k < opponentCount; k++) {
    const w = opponentReach[k];
    if (w <= 0) continue;
    const equity = equities[base + k];
    if (Number.isNaN(equity)) continue;
    weighted += equity * w;
    totalWeight += w;
  }
  return totalWeight > 0 ? weighted / totalWeight : 0.5;
}

/** Direct hero-perspective lookup by range index — mainly for tests. */
export function equityAt(table: EquityTable, heroIdx: number, villainIdx: number): number {
  return table.heroEquity[heroIdx * table.villainCount + villainIdx];
}

/**
 * Test helper: builds an `EquityTable` from the old `"heroKey|villainKey" ->
 * equity` string-map fixture shape tests used before the flat-array rewrite,
 * so synthetic small-table tests barely need to change. Only entries for
 * pairs that are actually present (in either direction) get filled; anything
 * else is left as a blocked (NaN) pair.
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
      const key = `${comboKey(h.cards)}|${comboKey(v.cards)}`;
      const reverseKey = `${comboKey(v.cards)}|${comboKey(h.cards)}`;
      let equity = entries.get(key);
      if (equity === undefined) {
        const reverse = entries.get(reverseKey);
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
