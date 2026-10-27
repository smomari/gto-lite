import { equityVsRange, type EquityTable } from "./terminalEquity";
import { totalPot, type PostflopPlayer } from "./potState";
import type { TerminalFoldNode, TerminalShowdownNode } from "./treeBuilder";

/**
 * Shared range-vector primitives for every solved-tree walk (cfr.ts,
 * exploitability.ts, checkdownEquity.ts) — keeping them in one place is what
 * guarantees those walks value terminals and propagate reach identically.
 */

export function weightedAverage(values: number[], weights: number[]): number {
  let weighted = 0;
  let totalWeight = 0;
  for (let i = 0; i < values.length; i++) {
    weighted += values[i] * weights[i];
    totalWeight += weights[i];
  }
  return totalWeight > 0 ? weighted / totalWeight : 0;
}

/** `player`'s chip result per own combo at a terminal, against the opponent's reach-weighted range. */
export function terminalUtilities(
  node: TerminalFoldNode | TerminalShowdownNode,
  player: PostflopPlayer,
  comboCount: number,
  opponentReach: number[],
  equityTable: EquityTable,
): number[] {
  const pot = totalPot(node.state);
  const committed = node.state.committed[player];
  const utilities = new Array<number>(comboCount);

  if (node.type === "terminal-fold") {
    const value = node.winner === player ? pot - committed : -committed;
    utilities.fill(value);
    return utilities;
  }

  for (let i = 0; i < comboCount; i++) {
    utilities[i] = equityVsRange(equityTable, player, i, opponentReach) * pot - committed;
  }
  return utilities;
}

/** The acting player's reach after taking `actionIndex`: each combo's reach times its probability of that action. */
export function narrowReach(reach: number[], strategy: number[][], actionIndex: number): number[] {
  return reach.map((r, c) => r * strategy[c][actionIndex]);
}

/**
 * The acting player's action probabilities averaged over their reach-weighted
 * range — what the non-acting player effectively faces, since they can't see
 * which specific combo the actor holds. Uniform when the actor has no reach.
 */
export function rangeAverageActionProbs(reach: number[], strategy: number[][], numActions: number): number[] {
  const probs = new Array<number>(numActions).fill(1 / numActions);
  let totalReach = 0;
  for (let c = 0; c < reach.length; c++) totalReach += reach[c];
  if (totalReach <= 0) return probs;

  for (let a = 0; a < numActions; a++) {
    let weighted = 0;
    for (let c = 0; c < reach.length; c++) weighted += reach[c] * strategy[c][a];
    probs[a] = weighted / totalReach;
  }
  return probs;
}
