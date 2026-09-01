import { compareHands } from "./handEval";
import type { ComboRange } from "./types";

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
const SUITS = ["s", "h", "d", "c"];
const FULL_DECK = RANKS.flatMap((r) => SUITS.map((s) => `${r}${s}`));

function remainingDeck(used: string[]): string[] {
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

function comboKey(cards: [string, string]): string {
  return [...cards].sort().join("");
}

/** Precomputed hero-combo-vs-villain-combo runout equities for one fixed board. Built once per solve, reused across all CFR iterations. */
export type EquityTable = Map<string, number>;

function shareCard(a: [string, string], b: [string, string]): boolean {
  return a.includes(b[0]) || a.includes(b[1]);
}

/** Builds the full pairwise equity table for two ranges on a fixed board, skipping card-blocked (impossible) pairs. */
export function buildEquityTable(
  heroRange: ComboRange,
  villainRange: ComboRange,
  board: string[],
  onProgress?: (done: number, total: number) => void,
): EquityTable {
  const table: EquityTable = new Map();
  const total = heroRange.length * villainRange.length;
  let done = 0;
  for (const h of heroRange) {
    for (const v of villainRange) {
      done++;
      if (shareCard(h.cards, v.cards)) continue;
      const key = `${comboKey(h.cards)}|${comboKey(v.cards)}`;
      if (!table.has(key)) {
        table.set(key, comboVsComboRunoutEquity(h.cards, v.cards, board));
      }
      if (onProgress && done % 200 === 0) onProgress(done, total);
    }
  }
  onProgress?.(total, total);
  return table;
}

function lookupEquity(table: EquityTable, heroCards: [string, string], villainCards: [string, string]): number {
  const key = `${comboKey(heroCards)}|${comboKey(villainCards)}`;
  const direct = table.get(key);
  if (direct !== undefined) return direct;
  const reverseKey = `${comboKey(villainCards)}|${comboKey(heroCards)}`;
  const reverse = table.get(reverseKey);
  if (reverse !== undefined) return 1 - reverse;
  throw new Error(`No equity entry for ${heroCards.join("")} vs ${villainCards.join("")}`);
}

/**
 * Hero combo's equity against a (reach-weighted) villain range, card-removal
 * corrected: any villain combo sharing a card with heroCards is excluded from
 * both the numerator and the weight total, not just zeroed out — otherwise
 * the equity would be diluted by combos that can't actually be in play
 * opposite this specific hero combo.
 */
export function equityVsRange(
  table: EquityTable,
  heroCards: [string, string],
  villainRange: ComboRange,
): number {
  let weighted = 0;
  let totalWeight = 0;
  for (const v of villainRange) {
    if (v.weight <= 0) continue;
    if (shareCard(heroCards, v.cards)) continue;
    weighted += lookupEquity(table, heroCards, v.cards) * v.weight;
    totalWeight += v.weight;
  }
  if (totalWeight === 0) return 0.5;
  return weighted / totalWeight;
}
