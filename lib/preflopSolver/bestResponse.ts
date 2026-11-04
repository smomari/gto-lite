import type { PreflopSolution } from "./cfr";
import { DEAL_ODDS } from "./payoff";
import { HAND_COUNT } from "./realization";
import type { TreeNode } from "./tree";

export interface SeatExploitability {
  /** The seat's expected chips with everyone on the average strategy. */
  ev: number;
  /** What it gains by best-responding instead, the others unchanged. */
  gain: number;
}

/** For each seat, how much it could win by deviating from the solution alone. Zero for all of them is an equilibrium. */
export function exploitability(solution: PreflopSolution): SeatExploitability[] {
  const { tree, payoffs } = solution;
  const strategies = new Map(tree.decisions.map((node) => [node, solution.strategy(node)]));

  const evaluate = (node: TreeNode, player: number, reach: Float64Array[], best: boolean): Float64Array => {
    if (node.kind === "terminal") return payoffs.values(node, player, reach);
    const strategy = strategies.get(node)!;
    const childValues = node.children.map((child, a) => {
      const next = reach.slice();
      next[node.player] = reach[node.player].map((r, i) => r * strategy[a][i]);
      // A best-responding seat's own reach doesn't change the others' values, so it is left as it is.
      return evaluate(child, player, node.player === player ? reach : next, best);
    });
    const value = new Float64Array(HAND_COUNT);
    if (node.player !== player) {
      childValues.forEach((v) => v.forEach((x, i) => (value[i] += x)));
    } else if (best) {
      for (let i = 0; i < HAND_COUNT; i++) value[i] = Math.max(...childValues.map((v) => v[i]));
    } else {
      childValues.forEach((v, a) => v.forEach((x, i) => (value[i] += strategy[a][i] * x)));
    }
    return value;
  };

  const start = () => tree.options.seats.map(() => new Float64Array(HAND_COUNT).fill(1));
  const total = (v: Float64Array) => v.reduce((sum, x, i) => sum + x * DEAL_ODDS[i], 0);
  return tree.options.seats.map((_, player) => {
    const ev = total(evaluate(tree.root, player, start(), false));
    return { ev, gain: total(evaluate(tree.root, player, start(), true)) - ev };
  });
}
