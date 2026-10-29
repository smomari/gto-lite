import { FULL_DECK } from "@/lib/cards";

/**
 * Showdown evaluation for every terminal-showdown node of a street at once —
 * almost all of a CFR iteration's cost. Same definition as `equityVsRange`:
 * blocked pairs drop out of both the weighted sum and the weight total, and a
 * row with no live opponent weight scores 0.5.
 *
 * Each (row, node) value is one dot product of the row's equities with the
 * node's opponent reach. The weight total skips blocked pairs without a second
 * dot product: blocked = sharing a card, so it is the node's total weight minus
 * the weight on each of the row's two cards, plus the one opponent combo that
 * holds both (inclusion–exclusion).
 */

const CARD_INDEX: Record<string, number> = Object.fromEntries(FULL_DECK.map((c, i) => [c, i]));
const DECK_SIZE = FULL_DECK.length;

/** One player's side of an equity table, row-major [row * cols + col], blocked pairs stored as 0. */
export interface ShowdownLayout {
  rows: number;
  cols: number;
  equity: Float32Array;
  /** [col * 2], [col * 2 + 1] = the opponent combo's two card indices. */
  colCards: Uint8Array;
  /** [row * 2], [row * 2 + 1] = the row combo's two card indices. */
  rowCards: Uint8Array;
  /** The opponent combo holding exactly this row's two cards, or -1. */
  rowSameCol: Int32Array;
}

function cardPair(cards: [string, string]): [number, number] {
  return [CARD_INDEX[cards[0]], CARD_INDEX[cards[1]]];
}

/**
 * From an `EquityTable` side (NaN = blocked pair) to the layout the kernel reads.
 * Throws when a NaN pair doesn't share a card (or vice versa): the weight-total
 * shortcut would then silently miscount.
 */
export function deriveShowdownLayout(
  equities: Float64Array,
  rowCombos: [string, string][],
  colCombos: [string, string][],
): ShowdownLayout {
  const rows = rowCombos.length;
  const cols = colCombos.length;
  const rowCards = new Uint8Array(rows * 2);
  const colCards = new Uint8Array(cols * 2);
  rowCombos.forEach((c, i) => rowCards.set(cardPair(c), i * 2));
  colCombos.forEach((c, j) => colCards.set(cardPair(c), j * 2));

  const colByPair = new Map<number, number>();
  for (let j = 0; j < cols; j++) {
    const a = colCards[j * 2], b = colCards[j * 2 + 1];
    colByPair.set(Math.min(a, b) * DECK_SIZE + Math.max(a, b), j);
  }
  const rowSameCol = new Int32Array(rows).fill(-1);

  const equity = new Float32Array(rows * cols);
  for (let i = 0; i < rows; i++) {
    const a = rowCards[i * 2], b = rowCards[i * 2 + 1];
    rowSameCol[i] = colByPair.get(Math.min(a, b) * DECK_SIZE + Math.max(a, b)) ?? -1;
    for (let j = 0; j < cols; j++) {
      const c = colCards[j * 2], d = colCards[j * 2 + 1];
      const blocked = a === c || a === d || b === c || b === d;
      const e = equities[i * cols + j];
      if (Number.isNaN(e) !== blocked) {
        throw new Error(`deriveShowdownLayout: pair (${i}, ${j}) is ${blocked ? "card-blocked but has an equity" : "missing an equity without sharing a card"}`);
      }
      if (!blocked) equity[i * cols + j] = e;
    }
  }
  return { rows, cols, equity, colCards, rowCards, rowSameCol };
}

/** Per node: total opponent weight, and the weight on each card — `byCard[node * 52 + card]`. */
export interface OpponentCardWeights {
  total: Float64Array;
  byCard: Float64Array;
}

/** `opponentReach[node * cols + col]` = that opponent combo's reach at that node. */
export function opponentCardWeights(layout: ShowdownLayout, opponentReach: Float64Array, nodeCount: number): OpponentCardWeights {
  const weights = { total: new Float64Array(nodeCount), byCard: new Float64Array(nodeCount * DECK_SIZE) };
  opponentCardWeightsInto(layout, opponentReach, nodeCount, weights);
  return weights;
}

/** Same as `opponentCardWeights`, written into existing buffers (e.g. shared with other workers). */
export function opponentCardWeightsInto(
  layout: ShowdownLayout,
  opponentReach: Float64Array,
  nodeCount: number,
  out: OpponentCardWeights,
): void {
  const { cols, colCards } = layout;
  const { total, byCard } = out;
  byCard.fill(0);
  for (let s = 0; s < nodeCount; s++) {
    const offset = s * cols;
    const cardOffset = s * DECK_SIZE;
    let sum = 0;
    for (let j = 0; j < cols; j++) {
      const w = opponentReach[offset + j];
      sum += w;
      byCard[cardOffset + colCards[j * 2]] += w;
      byCard[cardOffset + colCards[j * 2 + 1]] += w;
    }
    total[s] = sum;
  }
}

/**
 * For rows [rowStart, rowEnd): each row's equity at each of `nodeCount`
 * showdown nodes, written to `out[node * rows + row]`. Rows are independent,
 * so disjoint row ranges can be computed by different workers.
 */
export function showdownEquities(
  layout: ShowdownLayout,
  opponentReach: Float64Array,
  weights: OpponentCardWeights,
  nodeCount: number,
  rowStart: number,
  rowEnd: number,
  out: Float64Array,
): void {
  const { rows, cols, equity, rowCards, rowSameCol } = layout;
  const { total, byCard } = weights;

  for (let row = rowStart; row < rowEnd; row++) {
    const base = row * cols;
    const a = rowCards[row * 2], b = rowCards[row * 2 + 1], same = rowSameCol[row];
    for (let s = 0; s < nodeCount; s++) {
      const offset = s * cols;
      let num = 0;
      for (let col = 0; col < cols; col++) num += equity[base + col] * opponentReach[offset + col];
      const cardOffset = s * DECK_SIZE;
      const live = total[s] - byCard[cardOffset + a] - byCard[cardOffset + b] + (same >= 0 ? opponentReach[offset + same] : 0);
      // Subtraction can leave rounding dust where every opponent combo is blocked.
      out[s * rows + row] = live > total[s] * 1e-12 ? num / live : 0.5;
    }
  }
}
