import { Payoffs } from "./payoff";
import { HAND_COUNT, type HandMatrix, type RealizationParams } from "./realization";
import type { DecisionNode, PreflopTree, TreeNode } from "./tree";

/** DCFR's discounts (Brown & Sandholm 2019): positive regrets by t^α/(t^α+1), negative by half, iteration t's strategy weighted by t^γ. */
const ALPHA = 1.5;
const GAMMA = 2;

export const DEFAULT_PREFLOP_ITERATIONS = 2000;

interface NodeData {
  /** [action * HAND_COUNT + hand] */
  regret: Float64Array;
  strategySum: Float64Array;
}

export interface PreflopSolution {
  tree: PreflopTree;
  payoffs: Payoffs;
  iterations: number;
  /** The average strategy at this node: one frequency array per action, over ALL_HANDS. */
  strategy(node: DecisionNode): Float64Array[];
}

function regretMatched(node: DecisionNode, regret: Float64Array): Float64Array[] {
  const count = node.actions.length;
  const out = node.actions.map(() => new Float64Array(HAND_COUNT));
  for (let i = 0; i < HAND_COUNT; i++) {
    let total = 0;
    for (let a = 0; a < count; a++) total += Math.max(0, regret[a * HAND_COUNT + i]);
    for (let a = 0; a < count; a++) out[a][i] = total > 0 ? Math.max(0, regret[a * HAND_COUNT + i]) / total : 1 / count;
  }
  return out;
}

function normalized(node: DecisionNode, sum: Float64Array): Float64Array[] {
  const count = node.actions.length;
  const out = node.actions.map(() => new Float64Array(HAND_COUNT));
  for (let i = 0; i < HAND_COUNT; i++) {
    let total = 0;
    for (let a = 0; a < count; a++) total += sum[a * HAND_COUNT + i];
    for (let a = 0; a < count; a++) out[a][i] = total > 0 ? sum[a * HAND_COUNT + i] / total : 1 / count;
  }
  return out;
}

/**
 * Discounted CFR over the whole preflop tree, all 169 hands of a seat updated
 * together, seats taking turns each iteration. With three or more seats this
 * has no convergence guarantee; bestResponse.ts measures how close it got.
 */
export function solvePreflop(
  tree: PreflopTree,
  equity: HandMatrix,
  params: RealizationParams,
  iterations = DEFAULT_PREFLOP_ITERATIONS,
): PreflopSolution {
  const payoffs = new Payoffs(tree, equity, params);
  const data = new Map<DecisionNode, NodeData>(
    tree.decisions.map((node) => {
      const size = node.actions.length * HAND_COUNT;
      return [node, { regret: new Float64Array(size), strategySum: new Float64Array(size) }];
    }),
  );
  const seats = tree.options.seats.length;

  let t = 0;
  const traverse = (node: TreeNode, player: number, reach: Float64Array[]): Float64Array => {
    if (node.kind === "terminal") return payoffs.values(node, player, reach);
    const { regret, strategySum } = data.get(node)!;
    const strategy = regretMatched(node, regret);

    if (node.player !== player) {
      const total = new Float64Array(HAND_COUNT);
      node.children.forEach((child, a) => {
        const next = reach.slice();
        next[node.player] = reach[node.player].map((r, i) => r * strategy[a][i]);
        traverse(child, player, next).forEach((v, i) => (total[i] += v));
      });
      return total;
    }

    const own = reach[player];
    const childValues = node.children.map((child, a) => {
      const next = reach.slice();
      next[player] = own.map((r, i) => r * strategy[a][i]);
      return traverse(child, player, next);
    });
    const value = new Float64Array(HAND_COUNT);
    childValues.forEach((v, a) => v.forEach((x, i) => (value[i] += strategy[a][i] * x)));

    const positive = t ** ALPHA / (t ** ALPHA + 1);
    const weight = t ** GAMMA;
    childValues.forEach((v, a) => {
      for (let i = 0; i < HAND_COUNT; i++) {
        const k = a * HAND_COUNT + i;
        regret[k] = regret[k] * (regret[k] > 0 ? positive : 0.5) + v[i] - value[i];
        strategySum[k] += weight * own[i] * strategy[a][i];
      }
    });
    return value;
  };

  const start = () => Array.from({ length: seats }, () => new Float64Array(HAND_COUNT).fill(1));
  for (t = 1; t <= iterations; t++) {
    for (let player = 0; player < seats; player++) traverse(tree.root, player, start());
  }

  return {
    tree,
    payoffs,
    iterations,
    strategy: (node) => normalized(node, data.get(node)!.strategySum),
  };
}
