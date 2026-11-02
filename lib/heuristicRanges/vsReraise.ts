import type { EquityMatrix } from "@/lib/equity/loadEquityMatrix";
import { ALL_HANDS, TOTAL_COMBOS } from "@/lib/handRange/handList";
import { weightedEquityVsRange, type FrequencyMap } from "@/lib/nashSolver/pushFoldSolver";
import { netPot, type RakeTerms } from "@/lib/solveEngine/rake";
import type { HandFrequency } from "@/types/rangeData";
import {
  EQUITY_REALIZATION_IP,
  EQUITY_REALIZATION_OOP,
  RERAISE_KEEP_BASE,
  RERAISE_KEEP_MAX,
  RERAISE_KEEP_MIN,
  RERAISE_KEEP_PER_EQUITY,
} from "./config";

export interface VsReraiseParams {
  /** The hands this seat got here with. Anything else folds: it isn't really being dealt here. */
  heroRange: FrequencyMap;
  /** The hands behind the raise being faced, bluffs and all. */
  villainRange: FrequencyMap;
  isIP: boolean;
  /** Pot (bb) before hero acts. */
  potBb: number;
  /** Amount (bb) hero must add to call. */
  amountOwedBb: number;
  /** Share of all combos that re-raises. Only value does: no bluffs here. */
  raiseWidth: number;
  rake: RakeTerms;
}

export type VsShoveParams = Pick<VsReraiseParams, "heroRange" | "villainRange" | "potBb" | "amountOwedBb" | "rake">;

/**
 * Facing a raise that all but gets the stacks in, equity is what a hand wins:
 * it calls if that beats the real price of the real pot. Nothing here re-raises.
 */
export function generateCallShoveScenario(matrix: EquityMatrix, params: VsShoveParams): HandFrequency[] {
  const { heroRange, villainRange, potBb, amountOwedBb, rake } = params;
  const equityToCall = amountOwedBb / netPot(potBb + amountOwedBb, rake);
  return ALL_HANDS.map((h) => {
    const reached = (heroRange.get(h.hand) ?? 0) > 0;
    const call = reached && weightedEquityVsRange(matrix, h.hand, villainRange) > equityToCall ? 1 : 0;
    return { hand: h.hand, fold: 1 - call, call, raise: 0 };
  });
}

/**
 * Facing a re-raise with a range of its own, a seat keeps a share of it set by
 * how far the range's equity against the raiser's actual range clears the
 * price — so the width follows the raiser's range, the price, position and
 * rake, not a fixed share of the deck. The range's most playable hands are the
 * ones kept, not its best all-in equities, which would drop suited connectors
 * for weak offsuit hands. The very best re-raise: value only, no bluffs here.
 */
export function generateVsReraiseScenario(
  matrix: EquityMatrix,
  ranking: Map<string, number>,
  params: VsReraiseParams,
): HandFrequency[] {
  const { heroRange, villainRange, isIP, potBb, amountOwedBb, raiseWidth, rake } = params;
  const realization = isIP ? EQUITY_REALIZATION_IP : EQUITY_REALIZATION_OOP;
  const equityToCall = amountOwedBb / (realization * netPot(potBb + amountOwedBb, rake));

  const reached = ALL_HANDS.filter((h) => (heroRange.get(h.hand) ?? 0) > 0)
    .map((h) => ({
      hand: h.hand,
      combos: h.combos * heroRange.get(h.hand)!,
      equity: weightedEquityVsRange(matrix, h.hand, villainRange),
    }))
    .sort((a, b) => (ranking.get(a.hand) ?? 1) - (ranking.get(b.hand) ?? 1));
  const rangeCombos = reached.reduce((sum, h) => sum + h.combos, 0);
  const rangeEquity = reached.reduce((sum, h) => sum + h.equity * h.combos, 0) / rangeCombos;
  const keep = RERAISE_KEEP_BASE + RERAISE_KEEP_PER_EQUITY * (rangeEquity - equityToCall);

  const frequencies = new Map<string, { continueFreq: number; raise: number }>();
  let continueCombosLeft = Math.min(RERAISE_KEEP_MAX, Math.max(RERAISE_KEEP_MIN, keep)) * rangeCombos;
  let raiseCombosLeft = raiseWidth * TOTAL_COMBOS;
  for (const { hand, combos } of reached) {
    const continueFreq = Math.min(1, continueCombosLeft / combos);
    const raise = Math.min(continueFreq, raiseCombosLeft / combos);
    continueCombosLeft = Math.max(0, continueCombosLeft - continueFreq * combos);
    raiseCombosLeft = Math.max(0, raiseCombosLeft - raise * combos);
    frequencies.set(hand, { continueFreq, raise });
  }

  return ALL_HANDS.map((h) => {
    const { continueFreq, raise } = frequencies.get(h.hand) ?? { continueFreq: 0, raise: 0 };
    return { hand: h.hand, fold: 1 - continueFreq, call: continueFreq - raise, raise };
  });
}
