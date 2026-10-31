import { compareHands } from "../handEval";
import { totalPot } from "../potState";
import { comboVsComboRunoutEquity } from "../terminalEquity";
import type { ChanceNode, DecisionNode, PostflopTreeNode } from "../treeBuilder";
import type { ComboRange } from "../types";
import type { ExploitabilityResult } from "../exploitability";

/**
 * TEST ORACLE — not used by the app. The C++ engine's definitions
 * (native/solver/engine.cpp) written as plainly as possible: f64 throughout,
 * every (hero, villain) pair valued directly with no per-card-sum shortcuts,
 * and runout equities from the exact enumeration. Only for small ranges.
 *
 * Values are unnormalized counterfactual values; chance nodes zero the combos
 * holding the dealt card; alternating DCFR (P1, then P2 against P1's updated
 * regrets) with α = 1.5, β = 0, γ = 3 and the average reset at 4, 16, 64, …
 * — the same as the engine, so after the same iterations both
 * should agree up to f32 rounding.
 */

interface Context {
  hero: ComboRange;
  villain: ComboRange;
  /** compatible[i][j]: hero combo i and villain combo j share no card. */
  compatible: boolean[][];
  regret: Map<DecisionNode, number[][]>;
  stratSum: Map<DecisionNode, number[][]>;
  equityCache: Map<string, number[][]>;
}

interface Position {
  board: string[];
  before1: number;
  before2: number;
}

const holds = (cards: [string, string], card: string) => cards[0] === card || cards[1] === card;

function shareCard(a: [string, string], b: [string, string]) {
  return holds(b, a[0]) || holds(b, a[1]);
}

/** Hero equity vs each villain combo at a showdown on `board` (exact for any number of cards still to come). */
function heroEquities(ctx: Context, board: string[]): number[][] {
  const key = board.join("");
  let table = ctx.equityCache.get(key);
  if (!table) {
    table = ctx.hero.map((h) =>
      ctx.villain.map((v) => {
        if (shareCard(h.cards, v.cards) || board.some((c) => holds(h.cards, c) || holds(v.cards, c))) return 0;
        if (board.length === 5) {
          const cmp = compareHands([...h.cards, ...board], [...v.cards, ...board]);
          return cmp > 0 ? 1 : cmp === 0 ? 0.5 : 0;
        }
        return comboVsComboRunoutEquity(h.cards, v.cards, board);
      }),
    );
    ctx.equityCache.set(key, table);
  }
  return table;
}

/** Both players' values at a terminal: [hero values, villain values]. */
function terminalValues(ctx: Context, node: PostflopTreeNode, pos: Position, r1: number[], r2: number[]): [number[], number[]] {
  const pot = totalPot(node.state);
  const c1 = pos.before1 + node.state.committed.P1;
  const c2 = pos.before2 + node.state.committed.P2;
  const v1 = ctx.hero.map(() => 0);
  const v2 = ctx.villain.map(() => 0);
  const equity = node.type === "terminal-showdown" ? heroEquities(ctx, pos.board) : null;
  for (let i = 0; i < ctx.hero.length; i++) {
    for (let j = 0; j < ctx.villain.length; j++) {
      if (!ctx.compatible[i][j]) continue;
      let u1: number;
      let u2: number;
      if (node.type === "terminal-fold") {
        u1 = node.winner === "P1" ? pot - c1 : -c1;
        u2 = node.winner === "P2" ? pot - c2 : -c2;
      } else {
        const e = equity![i][j];
        u1 = pot * e - c1;
        u2 = pot * (1 - e) - c2;
      }
      v1[i] += r2[j] * u1;
      v2[j] += r1[i] * u2;
    }
  }
  return [v1, v2];
}

function matrix(rows: number, cols: number): number[][] {
  return Array.from({ length: rows }, () => new Array(cols).fill(0));
}

function regretMatch(regret: number[][]): number[][] {
  return regret.map((row) => {
    const positive = row.reduce((s, x) => s + Math.max(x, 0), 0);
    return row.map((x) => (positive > 0 ? Math.max(x, 0) / positive : 1 / row.length));
  });
}

function normalizedAverage(sum: number[][]): number[][] {
  return sum.map((row) => {
    const total = row.reduce((s, x) => s + x, 0);
    return row.map((x) => (total > 0 ? x / total : 1 / row.length));
  });
}

function zeroHolding(range: ComboRange, values: number[], card: string): number[] {
  return values.map((x, i) => (holds(range[i].cards, card) ? 0 : x));
}

/**
 * A sampled deal's per-combo renormalization (engine.cpp's SampledDeal): each
 * combo's weight is the deal's total minus the samples it holds; reach going
 * in is scaled by total / held, values coming out divided by held. A deal of
 * every card returns null — no correction.
 */
function sampledDeal(node: ChanceNode, hero: ComboRange, villain: ComboRange) {
  if (!node.sampled) return null;
  const total = node.children.reduce((s, c) => s + c.weight, 0);
  const held = (range: ComboRange) =>
    range.map(({ cards }) => total - node.children.reduce((s, c) => s + (holds(cards, c.card) ? c.weight : 0), 0));
  return { total, hero: held(hero), villain: held(villain) };
}

const scaleIn = (reach: number[], held: number[], total: number) => reach.map((r, i) => (held[i] > 0 ? (r * total) / held[i] : 0));
const normalizeOut = (values: number[], held: number[]) => values.map((x, i) => (held[i] > 0 ? x / held[i] : 0));

function childPosition(pos: Position, node: PostflopTreeNode & { type: "chance" }, card: string): Position {
  return { board: [...pos.board, card], before1: pos.before1 + node.state.committed.P1, before2: pos.before2 + node.state.committed.P2 };
}

/** One player's half of an iteration: `p`'s values against the opponent's current strategy, updating `p`'s regrets and the opponent's average. */
function cfr(
  ctx: Context,
  node: PostflopTreeNode,
  pos: Position,
  p: 0 | 1,
  oppReach: number[],
  update: { positiveDiscount: number; weight: number },
): number[] {
  const self = p === 0 ? ctx.hero : ctx.villain;
  const opp = p === 0 ? ctx.villain : ctx.hero;
  if (node.type === "terminal-fold" || node.type === "terminal-showdown") {
    const zeros = self.map(() => 0);
    return terminalValues(ctx, node, pos, p === 0 ? zeros : oppReach, p === 0 ? oppReach : zeros)[p];
  }
  if (node.type === "chance") {
    const deal = sampledDeal(node, ctx.hero, ctx.villain);
    const oppIn = deal ? scaleIn(oppReach, p === 0 ? deal.villain : deal.hero, deal.total) : oppReach;
    const out = self.map(() => 0);
    for (const { card, weight, child } of node.children) {
      const values = cfr(ctx, child, childPosition(pos, node, card), p, zeroHolding(opp, oppIn, card), update);
      zeroHolding(self, values, card).forEach((x, i) => (out[i] += weight * x));
    }
    return deal ? normalizeOut(out, p === 0 ? deal.hero : deal.villain) : out;
  }

  const regret = ctx.regret.get(node)!;
  const sigma = regretMatch(regret);
  if ((node.actor === "P1" ? 0 : 1) === p) {
    const actionValues = node.actions.map(({ child }) => cfr(ctx, child, pos, p, oppReach, update));
    const values = self.map((_, i) => actionValues.reduce((s, v, a) => s + sigma[i][a] * v[i], 0));
    for (let i = 0; i < self.length; i++) {
      for (let a = 0; a < node.actions.length; a++) {
        const x = regret[i][a] + actionValues[a][i] - values[i];
        regret[i][a] = x * (x > 0 ? update.positiveDiscount : 0.5);
      }
    }
    return values;
  }

  const sum = ctx.stratSum.get(node)!;
  oppReach.forEach((r, j) => node.actions.forEach((_, a) => (sum[j][a] += update.weight * r * sigma[j][a])));
  const children = node.actions.map(({ child }, a) => cfr(ctx, child, pos, p, oppReach.map((r, j) => r * sigma[j][a]), update));
  return self.map((_, i) => children.reduce((s, v) => s + v[i], 0));
}

/** Player `p`'s values with the opponent on the average strategy and `p` on it too, or on a best response. */
function evaluate(ctx: Context, node: PostflopTreeNode, pos: Position, p: 0 | 1, bestResponse: boolean, oppReach: number[]): number[] {
  const self = p === 0 ? ctx.hero : ctx.villain;
  const opp = p === 0 ? ctx.villain : ctx.hero;
  if (node.type === "terminal-fold" || node.type === "terminal-showdown") {
    const zeros = self.map(() => 0);
    return terminalValues(ctx, node, pos, p === 0 ? zeros : oppReach, p === 0 ? oppReach : zeros)[p];
  }
  if (node.type === "chance") {
    const deal = sampledDeal(node, ctx.hero, ctx.villain);
    const oppIn = deal ? scaleIn(oppReach, p === 0 ? deal.villain : deal.hero, deal.total) : oppReach;
    const out = self.map(() => 0);
    for (const { card, weight, child } of node.children) {
      const values = evaluate(ctx, child, childPosition(pos, node, card), p, bestResponse, zeroHolding(opp, oppIn, card));
      zeroHolding(self, values, card).forEach((x, i) => (out[i] += weight * x));
    }
    return deal ? normalizeOut(out, p === 0 ? deal.hero : deal.villain) : out;
  }
  const sigma = normalizedAverage(ctx.stratSum.get(node)!);
  const actorIsP = (node.actor === "P1" ? 0 : 1) === p;
  const children = node.actions.map(({ child }, a) =>
    evaluate(ctx, child, pos, p, bestResponse, actorIsP ? oppReach : oppReach.map((r, j) => r * sigma[j][a])),
  );
  return self.map((_, i) => {
    if (!actorIsP) return children.reduce((s, v) => s + v[i], 0);
    if (bestResponse) return Math.max(...children.map((v) => v[i]));
    return children.reduce((s, v, a) => s + sigma[i][a] * v[i], 0);
  });
}

export interface ReferenceCfr {
  iterate(firstT: number, count: number): void;
  exploitability(): ExploitabilityResult;
  averageStrategy(node: DecisionNode): number[][];
}

export function createReferenceCfr(tree: PostflopTreeNode, board: string[], hero: ComboRange, villain: ComboRange): ReferenceCfr {
  const ctx: Context = {
    hero,
    villain,
    compatible: hero.map((h) => villain.map((v) => !shareCard(h.cards, v.cards))),
    regret: new Map(),
    stratSum: new Map(),
    equityCache: new Map(),
  };
  (function init(node: PostflopTreeNode) {
    if (node.type === "decision") {
      const rows = node.actor === "P1" ? hero.length : villain.length;
      ctx.regret.set(node, matrix(rows, node.actions.length));
      ctx.stratSum.set(node, matrix(rows, node.actions.length));
      node.actions.forEach(({ child }) => init(child));
    } else if (node.type === "chance") {
      node.children.forEach(({ child }) => init(child));
    }
  })(tree);
  const root: Position = { board, before1: 0, before2: 0 };
  const w1 = hero.map((c) => c.weight);
  const w2 = villain.map((c) => c.weight);

  return {
    iterate(firstT, count) {
      for (let t = firstT; t < firstT + count; t++) {
        if (t > 1 && (t & (t - 1)) === 0 && Math.log2(t) % 2 === 0) for (const sum of ctx.stratSum.values()) for (const row of sum) row.fill(0);
        const tAlpha = Math.pow(t, 1.5);
        const update = { positiveDiscount: tAlpha / (tAlpha + 1), weight: Math.pow(t, 3) };
        cfr(ctx, tree, root, 0, w2, update);
        cfr(ctx, tree, root, 1, w1, update);
      }
    },
    exploitability() {
      const pairs = hero.reduce((s, h, i) => s + villain.reduce((t, v, j) => t + (ctx.compatible[i][j] ? h.weight * v.weight : 0), 0), 0);
      const ev = (p: 0 | 1, br: boolean) => {
        const values = evaluate(ctx, tree, root, p, br, p === 0 ? w2 : w1);
        return values.reduce((s, x, i) => s + (p === 0 ? w1 : w2)[i] * x, 0) / pairs;
      };
      const p1ActualBb = ev(0, false), p2ActualBb = ev(1, false);
      const p1BestResponseBb = ev(0, true), p2BestResponseBb = ev(1, true);
      const bb = (p1BestResponseBb - p1ActualBb + (p2BestResponseBb - p2ActualBb)) / 2;
      const startPot = tree.state.startPot;
      return { bb, percentOfPot: (bb / startPot) * 100, p1BestResponseBb, p2BestResponseBb, p1ActualBb, p2ActualBb };
    },
    averageStrategy(node) {
      return normalizedAverage(ctx.stratSum.get(node)!);
    },
  };
}
