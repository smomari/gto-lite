import { ALL_HANDS, TOTAL_COMBOS } from "@/lib/handRange/handList";
import { flopShareTable, HAND_COUNT, otherSide, type HandMatrix, type RealizationParams } from "./realization";
import type { PreflopTree, TerminalNode } from "./tree";

/** How likely each hand is to be dealt, ignoring the cards the others hold. */
export const DEAL_ODDS = Float64Array.from(ALL_HANDS, (h) => h.combos / TOTAL_COMBOS);

/**
 * Each seat's counterfactual value at the tree's terminals: what each of its
 * hands wins there, weighted by how likely the others are to have got there.
 * A seat's `reach` is the product of its own action frequencies on the way.
 */
export class Payoffs {
  /** By terminal: the in-position seat's pot share, row hand against column hand, then the out-of-position seat's. */
  private readonly shares = new Map<TerminalNode, [HandMatrix, HandMatrix]>();

  constructor(tree: PreflopTree, equity: HandMatrix, params: RealizationParams) {
    const showdown: [HandMatrix, HandMatrix] = [equity, otherSide(equity)];
    const bySpot = new Map<string, [HandMatrix, HandMatrix]>();
    for (const node of tree.terminals) {
      if (node.outcome === "showdown") this.shares.set(node, showdown);
      if (node.outcome !== "flop") continue;
      const ipLeads = node.state.lastAggressor === tree.options.seats[node.ip!];
      const key = `${node.spr}|${ipLeads}`;
      let pair = bySpot.get(key);
      if (!pair) {
        const ip = flopShareTable(equity, node.spr!, ipLeads, params);
        pair = [ip, otherSide(ip)];
        bySpot.set(key, pair);
      }
      this.shares.set(node, pair);
    }
  }

  values(node: TerminalNode, player: number, reach: Float64Array[]): Float64Array {
    const out = new Float64Array(HAND_COUNT);
    if (node.outcome === "abandoned") return out;
    const odds = (seat: number) => reach[seat].reduce((sum, r, j) => sum + r * DEAL_ODDS[j], 0);
    const opponent = node.outcome === "uncontested" || (node.ip !== player && node.oop !== player) ? -1 : node.ip === player ? node.oop! : node.ip!;
    let others = 1;
    reach.forEach((_, seat) => {
      if (seat !== player && seat !== opponent) others *= odds(seat);
    });

    if (opponent === -1) {
      const won = node.winner === player ? node.pot : 0;
      out.fill((won - node.committed[player]) * others);
      return out;
    }
    const table = this.shares.get(node)![node.ip === player ? 0 : 1];
    const weights = reach[opponent].map((r, j) => r * DEAL_ODDS[j]);
    const opponentOdds = weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < HAND_COUNT; i++) {
      let share = 0;
      const row = i * HAND_COUNT;
      for (let j = 0; j < HAND_COUNT; j++) share += table[row + j] * weights[j];
      out[i] = others * (node.pot * share - node.committed[player] * opponentOdds);
    }
    return out;
  }
}
