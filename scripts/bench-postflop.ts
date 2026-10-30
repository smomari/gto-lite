import { ALL_HANDS } from "../lib/handRange/handList";
import { expandToCombos } from "../lib/postflopSolver/combos";
import { buildEquityTable } from "../lib/postflopSolver/terminalEquity";
import { buildStreetTree, type DecisionNode } from "../lib/postflopSolver/treeBuilder";
import { runCfr } from "../lib/postflopSolver/cfr";
import { computeExploitability } from "../lib/postflopSolver/exploitability";
import type { ShowdownExecutor } from "../lib/postflopSolver/showdownExecutor";
import { loadNodeSolverModule } from "../lib/postflopSolver/wasm/loadNode";
import { createWasmShowdown } from "../lib/postflopSolver/wasm/wasmShowdown";

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

// Each scenario runs once per showdown kernel: the TypeScript one and the C++/WASM one.
async function main() {
  const kernels: { name: string; executor?: ShowdownExecutor }[] = [
    { name: "ts" },
    { name: "wasm", executor: createWasmShowdown(await loadNodeSolverModule()) },
  ];
  for (const s of SCENARIOS) for (const kernel of kernels) benchScenario(s, kernel.name, kernel.executor);
}

function benchScenario(s: (typeof SCENARIOS)[number], kernel: string, showdownExecutor: ShowdownExecutor | undefined) {
  const tree = buildStreetTree(s.startPot, s.stack, "flop");

  // Same iteration count every version → strategies must match for changes that shouldn't alter the math.
  t0 = performance.now();
  const fixed = runCfr(tree, hero, villain, table, { maxIterations: FIXED_ITERATIONS, showdownExecutor });
  const msPerIter = (performance.now() - t0) / FIXED_ITERATIONS;
  const root = fixed.getAverageStrategy(tree as DecisionNode);
  const weightSum = hero.reduce((sum, c) => sum + c.weight, 0);
  const rootFreqs = (tree as DecisionNode).actions.map((a, ai) => {
    const freq = hero.reduce((sum, c, ci) => sum + c.weight * root[ci][ai], 0) / weightSum;
    return `${a.action}:${(freq * 100).toFixed(4)}%`;
  });
  const fingerprint = root.reduce((sum, row, ci) => sum + row.reduce((r, p, ai) => r + p * (ci + 1) * (ai + 1), 0), 0);

  t0 = performance.now();
  const solved = runCfr(tree, hero, villain, table, {
    maxIterations: 20000,
    targetExploitabilityPercent: TARGET_PERCENT,
    showdownExecutor,
  });
  const solveSec = (performance.now() - t0) / 1000;
  const exploitability =
    solved.finalExploitability ?? computeExploitability(tree, solved, hero, villain, table, s.startPot);

  console.log(
    JSON.stringify({
      scenario: s.name,
      kernel,
      msPerIter: Number(msPerIter.toFixed(3)),
      toTarget: { iterations: solved.iterations, sec: Number(solveSec.toFixed(2)) },
      exploitabilityPct: Number(exploitability.percentOfPot.toFixed(4)),
      root: { at: FIXED_ITERATIONS, freqs: rootFreqs, fingerprint: Number(fingerprint.toFixed(6)) },
    }),
  );
}

main();
