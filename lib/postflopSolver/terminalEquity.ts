import { compareHands } from "./handEval";
import type { ComboRange } from "./types";

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
const SUITS = ["s", "h", "d", "c"];
const FULL_DECK = RANKS.flatMap((r) => SUITS.map((s) => `${r}${s}`));

function remainingDeck(used: string[]): string[] {
  const usedSet = new Set(used);
  return FULL_DECK.filter((c) => !usedSet.has(c));
}

/**
 * Exact equity of heroCombo vs villainCombo on a fixed flop board, enumerating
 * every possible turn+river completion (C(45,2) = 990 runouts) — not Monte
 * Carlo. Phase 1 only ever reaches showdown-type terminals with 2 more board
 * cards still to come (this is a flop-only solver: even a "both players
 * check" or "bet gets called" terminal isn't a real showdown yet in actual
 * poker, it's just where this street's action ends), so every non-fold
 * terminal's value is a runout equity, computed identically regardless of
 * whether it was reached via check-check, bet-call, or an all-in.
 */
export function comboVsComboRunoutEquity(
  heroCombo: [string, string],
  villainCombo: [string, string],
  board: string[],
): number {
  const deck = remainingDeck([...heroCombo, ...villainCombo, ...board]);
  let wins = 0;
  let ties = 0;
  let total = 0;

  for (let i = 0; i < deck.length; i++) {
    for (let j = i + 1; j < deck.length; j++) {
      const runout = [...board, deck[i], deck[j]];
      const cmp = compareHands([...heroCombo, ...runout], [...villainCombo, ...runout]);
      if (cmp > 0) wins++;
      else if (cmp === 0) ties++;
      total++;
    }
  }

  return (wins + ties * 0.5) / total;
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
export function buildEquityTable(heroRange: ComboRange, villainRange: ComboRange, board: string[]): EquityTable {
  const table: EquityTable = new Map();
  for (const h of heroRange) {
    for (const v of villainRange) {
      if (shareCard(h.cards, v.cards)) continue;
      const key = `${comboKey(h.cards)}|${comboKey(v.cards)}`;
      if (table.has(key)) continue;
      table.set(key, comboVsComboRunoutEquity(h.cards, v.cards, board));
    }
  }
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
