// Measures what share of the all-in bubble factor a call that doesn't get the stack in pays (ICM_RISK_SPR_EXPONENT):
// the chips that change hands by the end of the hand, from chip-EV full-lookahead flop solves, priced by each ICM stage.
// Usage: npx tsx scripts/icm-risk-weight.mts
import { loadEquityMatrix } from "@/lib/equity/loadEquityMatrix";
import { replayActionPath } from "@/lib/solveEngine/replay";
import { solveActiveSeat } from "@/lib/solveEngine/solve";
import { TOURNAMENT_8 } from "@/lib/solveEngine/gameFormat";
import { ICM_PRESETS, CHIP_EV, seatEquities } from "@/lib/solveEngine/icm";
import { NO_RAKE_SETTINGS } from "@/lib/solveEngine/rake";
import { solvePostflopStreet } from "@/lib/postflopSolver/solvePostflop";
import { loadNodeThreadedSolverModule } from "@/lib/postflopSolver/wasm/loadNode";
import type { PostflopTreeNode } from "@/lib/postflopSolver/treeBuilder";
import type { ActionType, HandFrequency, Position } from "@/types/rangeData";

const m = loadEquityMatrix();
const THREADS = 10;
const solver = await loadNodeThreadedSolverModule(THREADS);
const BOARDS = [["Kh", "7s", "2d"], ["As", "Td", "5c"], ["9h", "8h", "4c"], ["Qd", "Qs", "6h"], ["Jc", "Tc", "3s"], ["6d", "5s", "2c"]];
const FOLDS: [Position, ActionType][] = (["UTG", "UTG1", "LJ", "HJ", "CO"] as Position[]).map((s) => [s, "fold"]);
const path = (p: [Position, ActionType][]) => p.map(([actor, action]) => ({ actor, action }));

/** Probability of each terminal and the chips the loser put in, preflop and post, from the chip-EV average strategies. */
function transfers(res: ReturnType<typeof solvePostflopStreet>, preflopBb: number) {
  const out: { p: number; a: number }[] = [];
  const s1 = res.heroRange.map((c) => c.weight), s2 = res.villainRange.map((c) => c.weight);
  const total = (r: number[]) => r.reduce((x, y) => x + y, 0);
  const t1 = total(s1), t2 = total(s2);
  (function walk(node: PostflopTreeNode, r1: number[], r2: number[], before: { P1: number; P2: number }, chanceP: number) {
    if (node.type === "decision") {
      const strat = res.solution.getAverageStrategy(node);
      node.actions.forEach(({ child }, k) => {
        if (node.actor === "P1") walk(child, r1.map((x, i) => x * strat[i][k]), r2, before, chanceP);
        else walk(child, r1, r2.map((x, i) => x * strat[i][k]), before, chanceP);
      });
    } else if (node.type === "chance") {
      const sum = node.children.reduce((s, c) => s + c.weight, 0);
      const next = { P1: before.P1 + node.state.committed.P1, P2: before.P2 + node.state.committed.P2 };
      for (const { weight, child } of node.children) walk(child, r1, r2, next, (chanceP * weight) / sum);
    } else {
      const p = ((total(r1) / t1) * total(r2)) / t2 * chanceP;
      if (p <= 0) return;
      const c1 = before.P1 + node.state.committed.P1, c2 = before.P2 + node.state.committed.P2;
      const loser = node.type === "terminal-fold" ? (node.winner === "P1" ? c2 : c1) : Math.min(c1, c2);
      out.push({ p, a: preflopBb + loser });
    }
  })(res.tree, s1, s2, { P1: 0, P2: 0 }, 1);
  return out;
}

const spots: { name: string; stack: number; line: [Position, ActionType][]; ipLast: Position; oop: Position }[] = [
  { name: "BTN open, BB call", stack: 20, line: [...FOLDS, ["BTN", "raise"], ["SB", "fold"], ["BB", "call"]], ipLast: "BTN", oop: "BB" },
  { name: "BTN open, BB call", stack: 40, line: [...FOLDS, ["BTN", "raise"], ["SB", "fold"], ["BB", "call"]], ipLast: "BTN", oop: "BB" },
  { name: "BTN open, BB call", stack: 100, line: [...FOLDS, ["BTN", "raise"], ["SB", "fold"], ["BB", "call"]], ipLast: "BTN", oop: "BB" },
  { name: "BB 3-bet, BTN call", stack: 40, line: [...FOLDS, ["BTN", "raise"], ["SB", "fold"], ["BB", "raise"], ["BTN", "call"]], ipLast: "BTN", oop: "BB" },
  { name: "BB 3-bet, BTN call", stack: 100, line: [...FOLDS, ["BTN", "raise"], ["SB", "fold"], ["BB", "raise"], ["BTN", "call"]], ipLast: "BTN", oop: "BB" },
];
for (const spot of spots) {
  const S = spot.stack;
  // Each seat's range: its response at its last decision, chip EV.
  const handsAt = (upTo: number) => {
    const r = replayActionPath(path(spot.line.slice(0, upTo)), S, TOURNAMENT_8);
    if (r.status !== "active") throw new Error("inactive");
    return solveActiveSeat(m, r.activeSeat, r.potState, S, NO_RAKE_SETTINGS, CHIP_EV).hands;
  };
  const lastOf = (seat: Position) => spot.line.map(([s]) => s).lastIndexOf(seat);
  const final = replayActionPath(path(spot.line), S, TOURNAMENT_8);
  if (final.status !== "resolved") throw new Error("not resolved");
  const pot = final.potState.potBb, invested = final.potState.committed.BB!;
  const key = (seat: Position) => spot.line[lastOf(seat)][1] === "raise" ? "raise" : "call";
  const all: { p: number; a: number }[] = [];
  for (const board of BOARDS) {
    const started = performance.now();
    const res = solvePostflopStreet({ kind: "canonical", board, heroHandFrequencies: handsAt(lastOf(spot.oop)), heroActionWeight: (h: HandFrequency) => h[key(spot.oop)] ?? 0, villainHandFrequencies: handsAt(lastOf(spot.ipLast)), villainActionWeight: (h: HandFrequency) => h[key(spot.ipLast)] ?? 0, startPot: pot, effectiveStackBb: S - invested, maxIterations: 300, targetExploitabilityPercent: 0.5, fast: false } as never, { solver, threads: THREADS });
    const solved = performance.now();
    all.push(...transfers(res, invested).map((t) => ({ p: t.p / BOARDS.length, a: Math.min(t.a, S) })));
    res.session?.dispose();
    console.error(`  ${spot.name} ${S}bb ${board.join("")}: solve ${((solved - started) / 1000).toFixed(1)}s, walk ${((performance.now() - solved) / 1000).toFixed(1)}s`);
  }
  // Terminals that move the same chips share one ICM evaluation.
  const byAmount = new Map<number, number>();
  for (const t of all) byAmount.set(Math.round(t.a * 100) / 100, (byAmount.get(Math.round(t.a * 100) / 100) ?? 0) + t.p);
  all.length = 0;
  for (const [a, p] of byAmount) all.push({ a, p });
  const mass = all.reduce((s, t) => s + t.p, 0);
  const meanShare = all.reduce((s, t) => s + t.p * t.a, 0) / mass / S;
  const row = ICM_PRESETS.filter((i) => i !== CHIP_EV).map((icm) => {
    const V = (a: number) => seatEquities(icm, [S + a, S - a, ...Array(6).fill(S)], S)[0];
    const base = V(0);
    const bfAt = (a: number) => (base - V(-a)) / (V(a) - base);
    const eff = all.reduce((s, t) => s + t.p * (base - V(-t.a)), 0) / all.reduce((s, t) => s + t.p * (V(t.a) - base), 0);
    return `${icm.id} ${((eff - 1) / (bfAt(S) - 1)).toFixed(2)}`;
  });
  console.log(`${spot.name} ${S}bb: mass ${mass.toFixed(2)}, mean chips moved ${(100 * meanShare).toFixed(0)}% of stack, all-in ${(100 * all.filter((t) => t.a >= S - 1e-6).reduce((s, t) => s + t.p, 0) / mass).toFixed(0)}% | weight ${row.join(", ")}`);
}
