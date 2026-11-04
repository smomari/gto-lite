import { RANKS } from "@/lib/cards";
import { ALL_HANDS, type CanonicalHand } from "@/lib/handRange/handList";
import { equityOf, type EquityMatrix } from "@/lib/equity/loadEquityMatrix";

export const HAND_COUNT = ALL_HANDS.length;

/**
 * How much of its equity a hand gets out of a flop it sees, relative to the
 * other hand. Only the ratio between the two sides matters — the pot is split
 * so the shares always add to one — which is why there is no in-position
 * factor, only an out-of-position penalty.
 */
export interface RealizationParams {
  /** Out of position realizes this much less than in position. */
  oopPenalty: number;
  /** Suited hands realize this much more. */
  suitedBonus: number;
  /** Connected hands realize up to this much more: full for connectors, less per gap, none from three gaps. */
  connectorBonus: number;
  /**
   * Above 1, weak hands realize less of their equity and strong ones more: a
   * hand that is behind gives up to bets it can't call, one that is ahead gets
   * paid. Each side's weight is its equity to this power.
   */
  equityExponent: number;
  /** The preflop aggressor realizes this much more: it bets first into a range that checked to it. */
  initiativeBonus: number;
  /**
   * Stack-to-pot ratio at which the factors apply at half strength. They grow
   * with depth — more play left, more of the edge shows — and fade to raw
   * equity all-in.
   */
  halfSpr: number;
}

/** Fitted to GTO Wizard's MTT 100bb blind defense by `npm run proto:preflop -- --fit` (see that script for how far it carries). */
export const DEFAULT_REALIZATION: RealizationParams = {
  oopPenalty: 0.27,
  suitedBonus: 0.2,
  connectorBonus: 0.16,
  equityExponent: 1.4,
  initiativeBonus: 0.06,
  halfSpr: 1.5,
};

/** Every hand gets exactly its equity. */
export const RAW_EQUITY: RealizationParams = {
  oopPenalty: 0,
  suitedBonus: 0,
  connectorBonus: 0,
  equityExponent: 1,
  initiativeBonus: 0,
  halfSpr: 1,
};

/** 169×169, row hand against column hand, in ALL_HANDS order. */
export type HandMatrix = Float64Array;

/** The all-in equity matrix, evened out so each matchup's two sides add to exactly one (the sampled entries miss by a little). */
export function equityTable(matrix: EquityMatrix): HandMatrix {
  const table = new Float64Array(HAND_COUNT * HAND_COUNT);
  ALL_HANDS.forEach((a, i) =>
    ALL_HANDS.forEach((b, j) => {
      table[i * HAND_COUNT + j] = (equityOf(matrix, a.hand, b.hand) + 1 - equityOf(matrix, b.hand, a.hand)) / 2;
    }),
  );
  return table;
}

function connectedness(hand: CanonicalHand): number {
  if (hand.type === "pair") return 0;
  const gap = RANKS.indexOf(hand.rankLow) - RANKS.indexOf(hand.rankHigh) - 1;
  return Math.max(0, (3 - gap) / 3);
}

/** Each hand's realization factor before position and depth. */
export function playability(params: RealizationParams): Float64Array {
  return Float64Array.from(
    ALL_HANDS,
    (h) => 1 + (h.type === "suited" ? params.suitedBonus : 0) + params.connectorBonus * connectedness(h),
  );
}

/**
 * The in-position hand's (row) share of a flop pot against the out-of-position
 * hand (column), `ipLeads` when it made the last raise: equity, sharpened by `equityExponent` and weighted by each
 * side's realization, normalized so the
 * two shares add to one. At `spr` 0 — nobody has chips left to play with — it
 * is the raw equity.
 */
export function flopShareTable(equity: HandMatrix, spr: number, ipLeads: boolean, params: RealizationParams): HandMatrix {
  const depth = spr / (spr + params.halfSpr);
  const ipLead = ipLeads ? 1 + params.initiativeBonus : 1;
  const oopLead = ipLeads ? 1 : 1 + params.initiativeBonus;
  const exponent = 1 + (params.equityExponent - 1) * depth;
  const play = playability(params);
  const table = new Float64Array(HAND_COUNT * HAND_COUNT);
  for (let i = 0; i < HAND_COUNT; i++) {
    const ip = 1 + (play[i] * ipLead - 1) * depth;
    for (let j = 0; j < HAND_COUNT; j++) {
      const oop = 1 + (play[j] * oopLead * (1 - params.oopPenalty) - 1) * depth;
      const e = equity[i * HAND_COUNT + j];
      const ipWeight = e ** exponent * ip;
      const oopWeight = (1 - e) ** exponent * oop;
      table[i * HAND_COUNT + j] = ipWeight + oopWeight === 0 ? 0.5 : ipWeight / (ipWeight + oopWeight);
    }
  }
  return table;
}

/** The same shares from the column hand's side: transposed and complemented. */
export function otherSide(table: HandMatrix): HandMatrix {
  const flipped = new Float64Array(HAND_COUNT * HAND_COUNT);
  for (let i = 0; i < HAND_COUNT; i++) {
    for (let j = 0; j < HAND_COUNT; j++) flipped[i * HAND_COUNT + j] = 1 - table[j * HAND_COUNT + i];
  }
  return flipped;
}
