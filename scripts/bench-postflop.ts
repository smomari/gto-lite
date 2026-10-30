import { ALL_HANDS } from "../lib/handRange/handList";
import { expandToCombos } from "../lib/postflopSolver/combos";
import { buildEquityTable } from "../lib/postflopSolver/terminalEquity";
import { buildStreetTree, type DecisionNode } from "../lib/postflopSolver/treeBuilder";
import { runCfr, type CfrRunOptions, type CfrSolution } from "../lib/postflopSolver/cfr";
import { computeExploitability } from "../lib/postflopSolver/exploitability";
import type { PostflopTreeNode } from "../lib/postflopSolver/treeBuilder";
import { loadNodeSolverModule } from "../lib/postflopSolver/wasm/loadNode";
import { runNativeCfr } from "../lib/postflopSolver/wasm/engine";
import type { SolverModule } from "../lib/postflopSolver/wasm/solverModule";

// Fixed flop scenarios for comparing solver changes before/after:
// same board, ranges, and stacks every run.
const BOARD = ["Kh", "7s", "2d"];
const SCENARIOS = [
  { name: "SRP", startPot: 7.5, stack: 97 },
  { name: "3bet", startPot: 22, stack: 80 },
];
const TARGET_PERCENT = 0.5;
const FIXED_ITERATIONS = 1000;

function rangeOf(from: number, to: number) {
  const hands = ALL_HANDS.slice(from, to).map((h) => ({ hand: h.hand, fold: 0, call: 1, raise: 0 }));
  return expandToCombos(hands, (hf) => hf.call, BOARD);
}

const hero = rangeOf(0, 70);
const villain = rangeOf(20, 100);
let t0 = performance.now();
const table = buildEquityTable(hero, villain, BOARD);
console.log(`combos ${hero.length}x${villain.length}, equity table ${(performance.now() - t0).toFixed(0)}ms`);

type Solve = (tree: PostflopTreeNode, options: Pick<CfrRunOptions, "maxIterations" | "targetExploitabilityPercent">) => CfrSolution;

// Each scenario runs on both engines. Their exploitability numbers use slightly
// different definitions (the C++ engine's is the exact pair-weighted one), so
// compare each engine with its own earlier runs.
async function main() {
  const solver: SolverModule = await loadNodeSolverModule();
  const engines: { name: string; solve: Solve }[] = [
    { name: "ts", solve: (tree, options) => runCfr(tree, hero, villain, table, options) },
    {
      name: "cpp",
      solve: (tree, options) => runNativeCfr(solver, { tree, board: BOARD, heroRange: hero, villainRange: villain, rootEquityTable: table }, options),
    },
  ];
  for (const s of SCENARIOS) for (const engine of engines) benchScenario(s, engine.name, engine.solve);
}

function benchScenario(s: (typeof SCENARIOS)[number], engine: string, solve: Solve) {
  const tree = buildStreetTree(s.startPot, s.stack, "flop");

  // Same iteration count every version → strategies must match for changes that shouldn't alter the math.
  t0 = performance.now();
  const fixed = solve(tree, { maxIterations: FIXED_ITERATIONS });
  const msPerIter = (performance.now() - t0) / FIXED_ITERATIONS;
  const root = fixed.getAverageStrategy(tree as DecisionNode);
  const weightSum = hero.reduce((sum, c) => sum + c.weight, 0);
  const rootFreqs = (tree as DecisionNode).actions.map((a, ai) => {
    const freq = hero.reduce((sum, c, ci) => sum + c.weight * root[ci][ai], 0) / weightSum;
    return `${a.action}:${(freq * 100).toFixed(4)}%`;
  });
  const fingerprint = root.reduce((sum, row, ci) => sum + row.reduce((r, p, ai) => r + p * (ci + 1) * (ai + 1), 0), 0);

  t0 = performance.now();
  const solved = solve(tree, { maxIterations: 20000, targetExploitabilityPercent: TARGET_PERCENT });
  const solveSec = (performance.now() - t0) / 1000;
  const exploitability =
    solved.finalExploitability ?? computeExploitability(tree, solved, hero, villain, table, s.startPot);

  console.log(
    JSON.stringify({
      scenario: s.name,
      engine,
      msPerIter: Number(msPerIter.toFixed(3)),
      toTarget: { iterations: solved.iterations, sec: Number(solveSec.toFixed(2)) },
      exploitabilityPct: Number(exploitability.percentOfPot.toFixed(4)),
      root: { at: FIXED_ITERATIONS, freqs: rootFreqs, fingerprint: Number(fingerprint.toFixed(6)) },
    }),
  );
}

main();
