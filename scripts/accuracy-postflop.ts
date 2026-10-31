import { ALL_HANDS } from "../lib/handRange/handList";
import { LOOKAHEAD_BET_SIZING } from "../lib/postflopSolver/betAbstraction";
import { expandToCombos } from "../lib/postflopSolver/combos";
import { stratifiedNextCards } from "../lib/postflopSolver/nextCardSampling";
import { FLOP_LOOKAHEAD } from "../lib/postflopSolver/solvePostflop";
import { buildHandTree, buildStreetTree, type DecisionNode, type HandTreeOptions, type PostflopTreeNode } from "../lib/postflopSolver/treeBuilder";
import type { CfrSolution } from "../lib/postflopSolver/cfr";
import type { ComboRange } from "../lib/postflopSolver/types";
import { solveNativeSession, solveThreadedSession, type NativeSolveSession, type StrategyLock } from "../lib/postflopSolver/wasm/engine";
import { loadNodeThreadedSolverModule } from "../lib/postflopSolver/wasm/loadNode";
import { RunoutEquity } from "../lib/postflopSolver/wasm/runoutEquity";
import type { SolverModule } from "../lib/postflopSolver/wasm/solverModule";

// How far each way of ending a flop solve lands from the reference: a tree with
// every turn and every river, on the same flop menu and lookahead menus. Ranges
// are narrowed so the reference fits; run with --max-old-space-size for the tree.
//
// Strategy differences overstate mistakes where actions are close to
// indifferent, so "loss" prices them: each player in turn keeps the method's
// flop strategy, locked into the reference tree, and everything else (the
// opponent, and their own turn and river play) solves freely against it. What
// that player's EV drops by, in % of the pot, is what the flop strategy costs.
// "reference" locks the reference's own strategy: its loss is the noise floor.
//   NODE_OPTIONS=--max-old-space-size=12000 npm run accuracy:postflop [-- spot-name ...]

const THREADS = 9;
const REFERENCE_TARGET_PERCENT = 0.1;
const APP_TARGET_PERCENT = 0.5;
const LOCKED_TARGET_PERCENT = 0.25;
const MAX_ITERATIONS = 3000;

const THREE_BET_OOP = "AA KK QQ JJ TT AKs AQs AJs KQs A5s A4s AKo AQo";
const THREE_BET_IP = "JJ TT 99 88 77 66 55 AQs AJs ATs KQs KJs QJs JTs T9s 98s 87s 76s AQo AJo KQo";
const SRP_OOP = "99 88 77 66 55 44 33 22 ATs A9s A8s A7s A6s A5s A4s A3s A2s KTs K9s QTs Q9s JTs J9s T9s T8s 98s 97s 87s 86s 76s 65s 54s AJo ATo KJo KTo QJo QTo JTo";
const SRP_IP = "AA KK QQ JJ TT 99 88 77 66 55 44 33 22 AKs AQs AJs ATs A9s A8s A7s A6s A5s A4s A3s A2s KQs KJs KTs K9s K8s QJs QTs Q9s JTs J9s T9s T8s 98s 87s 76s 65s AKo AQo AJo ATo KQo KJo KTo QJo QTo JTo";

const SPOTS = [
  { name: "3bet-dry", board: ["Kh", "7s", "2d"], startPot: 22, stack: 80, oop: THREE_BET_OOP, ip: THREE_BET_IP },
  { name: "3bet-twotone", board: ["Jh", "Th", "5c"], startPot: 22, stack: 80, oop: THREE_BET_OOP, ip: THREE_BET_IP },
  { name: "3bet-monotone", board: ["Ah", "9h", "4h"], startPot: 22, stack: 80, oop: THREE_BET_OOP, ip: THREE_BET_IP },
  { name: "3bet-paired", board: ["8s", "8d", "3c"], startPot: 22, stack: 80, oop: THREE_BET_OOP, ip: THREE_BET_IP },
  { name: "srp-dry", board: ["Kh", "7s", "2d"], startPot: 5.5, stack: 97.5, oop: SRP_OOP, ip: SRP_IP },
  { name: "srp-twotone", board: ["Jh", "Th", "5c"], startPot: 5.5, stack: 97.5, oop: SRP_OOP, ip: SRP_IP },
];

const everyCard: HandTreeOptions = { laterStreetSizing: LOOKAHEAD_BET_SIZING };
const sampled = (turnCards: number, riverCards: number): HandTreeOptions => ({
  dealNextCards: (board) => stratifiedNextCards(board, board.length === 3 ? turnCards : riverCards),
  laterStreetSizing: LOOKAHEAD_BET_SIZING,
  lastStreet: riverCards > 0 ? "river" : "turn",
});

const METHODS: { name: string; options: HandTreeOptions | null }[] = [
  { name: "checkdown", options: null },
  { name: `K${FLOP_LOOKAHEAD.turnCards} (app)`, options: sampled(FLOP_LOOKAHEAD.turnCards, FLOP_LOOKAHEAD.riverCards) },
  { name: "K16", options: sampled(16, 0) },
  { name: "K10xM6", options: sampled(10, 6) },
  { name: "K-all", options: { ...everyCard, lastStreet: "turn" } },
];

function rangeOf(hands: string, board: string[]): ComboRange {
  const names = new Set(hands.split(" "));
  return expandToCombos(
    ALL_HANDS.filter((h) => names.has(h.hand)).map((h) => ({ hand: h.hand, fold: 0, call: 1, raise: 0 })),
    (hf) => hf.call,
    board,
  );
}

function countNodes(tree: PostflopTreeNode): number {
  let count = 1;
  if (tree.type === "decision") for (const { child } of tree.actions) count += countNodes(child);
  else if (tree.type === "chance") for (const { child } of tree.children) count += countNodes(child);
  return count;
}

interface Solved {
  tree: PostflopTreeNode;
  session: NativeSolveSession;
  sec: number;
}

function solve(
  solver: SolverModule,
  runout: RunoutEquity,
  spot: (typeof SPOTS)[number],
  hero: ComboRange,
  villain: ComboRange,
  options: HandTreeOptions | null,
  target: number,
  existingTree?: PostflopTreeNode,
  locks: StrategyLock[] = [],
): Solved {
  const t0 = performance.now();
  const tree =
    existingTree ?? (options ? buildHandTree(spot.startPot, spot.stack, spot.board, options) : buildStreetTree(spot.startPot, spot.stack, "flop"));
  console.error(`  tree ${countNodes(tree)} nodes, ${((performance.now() - t0) / 1000).toFixed(1)}s`);
  const input = {
    tree,
    board: spot.board,
    heroRange: hero,
    villainRange: villain,
    rootEquityTable: runout.flopTable(),
    equityTableFor: (board: string[]) => (board.length === 4 ? runout.turnTable(board[3]) : undefined),
  };
  const cfr = { maxIterations: MAX_ITERATIONS, targetExploitabilityPercent: target };
  const progress = (done: number, _total: number, exploitability?: number) => {
    if (exploitability !== undefined) console.error(`  ${done} iterations, ${exploitability.toFixed(3)}% (${((performance.now() - t0) / 1000).toFixed(0)}s)`);
  };
  const session = options ? solveThreadedSession(solver, input, cfr, progress, THREADS, locks) : solveNativeSession(solver, input, cfr, progress);
  return { tree, session, sec: (performance.now() - t0) / 1000 };
}

function rootFrequencies(node: DecisionNode, solution: CfrSolution, range: ComboRange): number[] {
  const strategy = solution.getAverageStrategy(node);
  const mass = range.reduce((sum, c) => sum + c.weight, 0);
  return node.actions.map((_, a) => range.reduce((sum, c, i) => sum + c.weight * strategy[i][a], 0) / mass);
}

/** Reach-weighted total variation from the reference over the root street's decisions, for each player: 0 = same strategy, 1 = disjoint. */
function strategyDistance(reference: Solved, method: Solved, hero: ComboRange, villain: ComboRange): number[] {
  const distance = [0, 0];
  const mass = [0, 0];
  const walk = (a: PostflopTreeNode, b: PostflopTreeNode, reach: number[][]) => {
    if (a.type !== "decision" || b.type !== "decision") return;
    const p = a.actor === "P1" ? 0 : 1;
    const want = reference.session.solution.getAverageStrategy(a);
    const got = method.session.solution.getAverageStrategy(b);
    reach[p].forEach((r, i) => {
      distance[p] += (r * want[i].reduce((sum, x, k) => sum + Math.abs(x - got[i][k]), 0)) / 2;
      mass[p] += r;
    });
    a.actions.forEach(({ child }, k) => {
      const next = [...reach];
      next[p] = reach[p].map((r, i) => r * want[i][k]);
      walk(child, b.actions[k].child, next);
    });
  };
  walk(reference.tree, method.tree, [hero.map((c) => c.weight), villain.map((c) => c.weight)]);
  return distance.map((d, p) => d / mass[p]);
}

/** One player's root-street strategy from `solved`, as locks on the same decisions of the reference tree. */
function rootStreetLocks(reference: PostflopTreeNode, solved: Solved, actor: "P1" | "P2"): StrategyLock[] {
  const locks: StrategyLock[] = [];
  const walk = (a: PostflopTreeNode, b: PostflopTreeNode) => {
    if (a.type !== "decision" || b.type !== "decision") return;
    if (a.actor === actor) locks.push({ node: a, strategy: solved.session.solution.getAverageStrategy(b) });
    a.actions.forEach(({ child }, k) => walk(child, b.actions[k].child));
  };
  walk(reference, solved.tree);
  return locks;
}

const percent = (x: number) => (x * 100).toFixed(1);

async function main() {
  const wanted = process.argv.slice(2);
  const solver = await loadNodeThreadedSolverModule(THREADS);
  for (const spot of SPOTS.filter((s) => wanted.length === 0 || wanted.includes(s.name))) {
    const hero = rangeOf(spot.oop, spot.board);
    const villain = rangeOf(spot.ip, spot.board);
    console.error(`${spot.name}: ${hero.length}x${villain.length} combos`);
    const runout = RunoutEquity.create(solver, hero, villain, spot.board);

    const reference = solve(solver, runout, spot, hero, villain, everyCard, REFERENCE_TARGET_PERCENT);
    const refReport = reference.session.solution.finalExploitability!;
    const root = reference.tree as DecisionNode;
    const refFreq = rootFrequencies(root, reference.session.solution, hero);
    console.log(`\n## ${spot.name} ${spot.board.join(" ")} (${hero.length}x${villain.length} combos)`);
    console.log(`reference: ${reference.sec.toFixed(0)}s, ${reference.session.solution.iterations} iterations, ${refReport.percentOfPot.toFixed(3)}% exploitable`);
    console.log(`root ${root.actions.map((a, k) => `${a.action} ${percent(refFreq[k])}`).join(" · ")}, OOP EV ${refReport.p1ActualBb.toFixed(3)}bb`);
    console.log("method | sec | root freq max diff (pts) | OOP EV diff (% pot) | IP EV diff (% pot) | OOP strategy distance | IP strategy distance | exploitable | OOP loss (% pot) | IP loss (% pot)");
    /** What keeping `solved`'s flop strategy costs each player against the reference, in % of the pot. */
    const losses = (solved: Solved) =>
      (["P1", "P2"] as const).map((actor) => {
        const locked = solve(solver, runout, spot, hero, villain, everyCard, LOCKED_TARGET_PERCENT, reference.tree, rootStreetLocks(reference.tree, solved, actor));
        const report = locked.session.solution.finalExploitability!;
        locked.session.dispose();
        const drop = actor === "P1" ? refReport.p1ActualBb - report.p1ActualBb : refReport.p2ActualBb - report.p2ActualBb;
        return ((100 * drop) / spot.startPot).toFixed(2);
      });
    console.log(["reference", "", "", "", "", "", "", "", ...losses(reference)].join(" | "));
    for (const method of METHODS) {
      console.error(method.name);
      const solved = solve(solver, runout, spot, hero, villain, method.options, APP_TARGET_PERCENT);
      const report = solved.session.solution.finalExploitability!;
      const freq = rootFrequencies(solved.tree as DecisionNode, solved.session.solution, hero);
      const freqDiff = Math.max(...freq.map((f, k) => Math.abs(f - refFreq[k])));
      const [oop, ip] = strategyDistance(reference, solved, hero, villain);
      console.log(
        [
          method.name,
          solved.sec.toFixed(1),
          percent(freqDiff),
          ((100 * (report.p1ActualBb - refReport.p1ActualBb)) / spot.startPot).toFixed(2),
          ((100 * (report.p2ActualBb - refReport.p2ActualBb)) / spot.startPot).toFixed(2),
          percent(oop),
          percent(ip),
          `${report.percentOfPot.toFixed(2)}%`,
          ...losses(solved),
        ].join(" | "),
      );
      solved.session.dispose();
    }
    reference.session.dispose();
    runout.dispose();
  }
  process.exit(0);
}

void main();
