import { BET_SIZING, type StreetBetSizing } from "./betAbstraction";
import type { CfrSolution } from "./cfr";
import { totalPot, type PostflopPlayer, type PostflopPotState } from "./potState";
import type { DecisionNode, PostflopTreeNode } from "./treeBuilder";
import type { ComboRange } from "./types";

// A flop is solved twice. A quick pass on every candidate bet size shows which
// sizes each player uses on this board with these ranges; the solve that is
// shown keeps two of them per player. Against a complete tree on all four
// sizes and all-in (npm run accuracy:postflop -- --size-pick), both players
// together lost 1.7% of the pot this way and 2.1% on a fixed 33/50/100% menu
// over seven spots, in the same time or less: a player who rarely bets keeps
// one size, and only then is the tree smaller.

/** The opening bet sizes a flop can be solved with, as fractions of the pot. */
export const FLOP_BET_CANDIDATES = BET_SIZING.flop.betPotFractions;

/** Pairs at least one candidate apart: neighbours stand in for each other, so keeping two of them wastes a slot. */
const SIZE_PAIRS = [
  [0.33, 0.75],
  [0.33, 1.0],
  [0.5, 1.0],
];

/** A player betting less often than this keeps one size: how sizes barely used rank is noise. */
export const RARE_BET = 0.1;

/**
 * An opening all-in is offered with a stack of at most this many pots. At 1.9
 * pots on JT5 two-tone a 3-bettor shoves 64% of the time, and a menu without
 * it lost 2.2% of the pot where one with it lost 0.4%; at 3.6 pots it is 2%.
 */
export const ALLIN_OPEN_MAX_SPR = 3;

/** Each player's opening bet sizes. */
export type OpenSizes = Record<PostflopPlayer, number[]>;

export const EVERY_CANDIDATE: OpenSizes = { P1: FLOP_BET_CANDIDATES, P2: FLOP_BET_CANDIDATES };

export function offersOpeningAllin(startPot: number, effectiveStackBb: number): boolean {
  return effectiveStackBb <= ALLIN_OPEN_MAX_SPR * startPot;
}

/** The flop menu with each player's own opening sizes. Facing a bet it is BET_SIZING's: its raises, or all-in. */
export function flopMenu(open: OpenSizes, allinOpen: boolean): (state: PostflopPotState, actor: PostflopPlayer) => StreetBetSizing {
  return (state, actor) =>
    state.currentBetToCall > state.committed[actor]
      ? { betPotFractions: [], raisePotFractions: BET_SIZING.flop.raisePotFractions }
      : { betPotFractions: open[actor], raisePotFractions: [], allin: allinOpen ? "always" : "when-no-size-fits" };
}

const nearestCandidate = (fraction: number) =>
  FLOP_BET_CANDIDATES.reduce((best, c) => (Math.abs(c - fraction) < Math.abs(best - fraction) ? c : best));

/** How much of `range` an opening decision bets at each candidate size. */
export function openingUse(node: DecisionNode, solution: CfrSolution, range: ComboRange): Map<number, number> {
  const strategy = solution.getAverageStrategy(node);
  const mass = range.reduce((sum, combo) => sum + combo.weight, 0);
  const bySize = new Map<number, number>();
  node.actions.forEach(({ action, child }, a) => {
    if (action !== "bet") return;
    const size = nearestCandidate(child.state.committed[node.actor] / totalPot(node.state));
    const frequency = range.reduce((sum, combo, i) => sum + combo.weight * strategy[i][a], 0) / mass;
    bySize.set(size, (bySize.get(size) ?? 0) + frequency);
  });
  return bySize;
}

/**
 * The sizes a player keeps: the pair the sizes they used sit closest to (in
 * log size, weighted by use), or the one they used most when they rarely bet.
 */
export function pickSizes(bySize: ReadonlyMap<number, number>): number[] {
  const used = FLOP_BET_CANDIDATES.map((c) => bySize.get(c) ?? 0);
  if (used.reduce((a, b) => a + b, 0) < RARE_BET) return [FLOP_BET_CANDIDATES[used.indexOf(Math.max(...used))]];
  const cost = (pair: number[]) =>
    FLOP_BET_CANDIDATES.reduce((sum, c, k) => sum + used[k] * Math.min(...pair.map((p) => Math.abs(Math.log(c / p)))), 0);
  return SIZE_PAIRS.reduce((best, pair) => (cost(pair) < cost(best) ? pair : best));
}

/** Both players' sizes from a solved flop: the root's for P1, and for P2 the decision after its check. */
export function pickFlopSizes(tree: PostflopTreeNode, solution: CfrSolution, heroRange: ComboRange, villainRange: ComboRange): OpenSizes {
  if (tree.type !== "decision") return EVERY_CANDIDATE;
  const afterCheck = tree.actions.find(({ action }) => action === "check")?.child;
  return {
    P1: pickSizes(openingUse(tree, solution, heroRange)),
    P2: afterCheck?.type === "decision" ? pickSizes(openingUse(afterCheck, solution, villainRange)) : FLOP_BET_CANDIDATES,
  };
}
