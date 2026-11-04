import { describe, expect, it } from "vitest";
import { loadEquityMatrix } from "@/lib/equity/loadEquityMatrix";
import { ALL_HANDS, HAND_BY_LABEL } from "@/lib/handRange/handList";
import { solvePushFold } from "@/lib/nashSolver/pushFoldSolver";
import { TOURNAMENT_8 } from "@/lib/solveEngine/gameFormat";
import { exploitability } from "./bestResponse";
import { solvePreflop } from "./cfr";
import { DEAL_ODDS } from "./payoff";
import { DEFAULT_REALIZATION, equityTable, RAW_EQUITY } from "./realization";
import { BLIND_DEFENSE_RULES, buildPreflopTree, nodeAt, PUSH_FOLD_RULES, type DecisionNode } from "./tree";

const matrix = loadEquityMatrix();
const equity = equityTable(matrix);
const width = (freq: Float64Array) => 100 * freq.reduce((sum, f, i) => sum + f * DEAL_ODDS[i], 0);
const index = (hand: string) => ALL_HANDS.indexOf(HAND_BY_LABEL.get(hand)!);

describe("solvePreflop", () => {
  /**
   * solvePushFold charges a caller its whole stack and adds the blinds to the
   * called pot on top of both stacks, where here the blinds are part of the
   * stacks. The two agree at 15bb and drift apart as stacks get shorter (at 5bb
   * the BB calls 56% there and 81% here).
   */
  it("agrees with the push/fold solver on a shove-or-fold game", () => {
    const tree = buildPreflopTree({ format: TOURNAMENT_8, stackBb: 15, seats: ["SB", "BB"], rules: PUSH_FOLD_RULES });
    const solution = solvePreflop(tree, equity, RAW_EQUITY, 1000);
    for (const { gain } of exploitability(solution)) expect(gain).toBeLessThan(0.001);
    const root = tree.root as DecisionNode;
    const call = nodeAt(tree, ["allin"]) as DecisionNode;
    const nash = solvePushFold(matrix, { effectiveStackBb: 15 });
    const nashWidth = (freq: Map<string, number>) => 100 * ALL_HANDS.reduce((sum, h, i) => sum + (freq.get(h.hand) ?? 0) * DEAL_ODDS[i], 0);
    expect(Math.abs(width(solution.strategy(root)[0]) - nashWidth(nash.shoveFrequency))).toBeLessThanOrEqual(2);
    expect(Math.abs(width(solution.strategy(call)[0]) - nashWidth(nash.callFrequency))).toBeLessThanOrEqual(2);
  }, 30_000);

  it("converges on the blind-defense tree", () => {
    const tree = buildPreflopTree({ format: TOURNAMENT_8, stackBb: 100, seats: ["BTN", "SB", "BB"], rules: BLIND_DEFENSE_RULES });
    const solution = solvePreflop(tree, equity, DEFAULT_REALIZATION, 300);
    for (const { gain } of exploitability(solution)) expect(gain).toBeLessThan(0.01);

    for (const node of tree.decisions) {
      const fold = node.actions.findIndex((a) => a.action === "fold");
      for (const hand of ["AA", "KK"]) expect(solution.strategy(node)[fold][index(hand)]).toBeLessThan(0.01);
    }
    const bb = nodeAt(tree, ["raise", "fold"]) as DecisionNode;
    const strategy = solution.strategy(bb);
    const reraise = bb.actions.reduce((sum, a, k) => sum + (a.action === "raise" || a.action === "allin" ? strategy[k][index("AA")] : 0), 0);
    expect(reraise).toBeGreaterThan(0.9);
  }, 30_000);
});
