import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ALL_HANDS } from "../lib/handRange/handList";
import { LOOKAHEAD_BET_SIZING, streetForBoardLength, type StreetBetSizing } from "../lib/postflopSolver/betAbstraction";
import { expandToCombos, filterBlockedCombos } from "../lib/postflopSolver/combos";
import { clusteredNextCards, stratifiedNextCards } from "../lib/postflopSolver/nextCardSampling";
import { EVERY_CANDIDATE, flopMenu, offersOpeningAllin, pickFlopSizes, type OpenSizes } from "../lib/postflopSolver/flopSizing";
import { totalPot, type PostflopPlayer } from "../lib/postflopSolver/potState";
import { buildHandTree, buildStreetTree, dealEveryCard, type DecisionNode, type HandTreeOptions, type PostflopTreeNode, type StreetSizing } from "../lib/postflopSolver/treeBuilder";
import type { CfrSolution } from "../lib/postflopSolver/cfr";
import type { EquityTable } from "../lib/postflopSolver/terminalEquity";
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
//   NODE_OPTIONS=--max-old-space-size=12000 npm run accuracy:postflop [-- --spots a,b --methods c,d]
// A method names its turn and river cards: K10, K10xM6, Kall, K10xMall, stratified
// or, with C for K, clustered (the app's flop, C16xM6); a turn spot only has
// rivers: M12, Mall. "checkdown" stops at the street's end. The
// real-* spots are a BTN-vs-BB line with its real weights, from before the BB's
// defense widened: at today's 704×566 combos the reference would pass WASM's
// 4GB. A turn spot narrows them by a check-check on the flop.

type HandWeights = Record<string, number>;

const THREADS = 9;
const REFERENCE_TARGET_PERCENT = 0.1;
const APP_TARGET_PERCENT = 0.5;
const LOCKED_TARGET_PERCENT = 0.25;
const MAX_ITERATIONS = 3000;

const THREE_BET_OOP = "AA KK QQ JJ TT AKs AQs AJs KQs A5s A4s AKo AQo";
const THREE_BET_IP = "JJ TT 99 88 77 66 55 AQs AJs ATs KQs KJs QJs JTs T9s 98s 87s 76s AQo AJo KQo";
const SRP_OOP = "99 88 77 66 55 44 33 22 ATs A9s A8s A7s A6s A5s A4s A3s A2s KTs K9s QTs Q9s JTs J9s T9s T8s 98s 97s 87s 86s 76s 65s 54s AJo ATo KJo KTo QJo QTo JTo";
const SRP_IP = "AA KK QQ JJ TT 99 88 77 66 55 44 33 22 AKs AQs AJs ATs A9s A8s A7s A6s A5s A4s A3s A2s KQs KJs KTs K9s K8s QJs QTs Q9s JTs J9s T9s T8s 98s 87s 76s 65s AKo AQo AJo ATo KQo KJo KTo QJo QTo JTo";

const REAL = JSON.parse(readFileSync(resolve(process.cwd(), "scripts/fixtures/btn-vs-bb-100bb.json"), "utf-8")) as { oop: HandWeights; ip: HandWeights };
const REAL_SPOT = { startPot: 6.5, stack: 97.5, oop: REAL.oop, ip: REAL.ip };

interface Spot {
  name: string;
  board: string[];
  startPot: number;
  stack: number;
  oop: string | HandWeights;
  ip: string | HandWeights;
}

const SPOTS: Spot[] = [
  { name: "3bet-dry", board: ["Kh", "7s", "2d"], startPot: 22, stack: 80, oop: THREE_BET_OOP, ip: THREE_BET_IP },
  { name: "3bet-twotone", board: ["Jh", "Th", "5c"], startPot: 22, stack: 80, oop: THREE_BET_OOP, ip: THREE_BET_IP },
  { name: "3bet-monotone", board: ["Ah", "9h", "4h"], startPot: 22, stack: 80, oop: THREE_BET_OOP, ip: THREE_BET_IP },
  { name: "3bet-paired", board: ["8s", "8d", "3c"], startPot: 22, stack: 80, oop: THREE_BET_OOP, ip: THREE_BET_IP },
  { name: "srp-dry", board: ["Kh", "7s", "2d"], startPot: 5.5, stack: 97.5, oop: SRP_OOP, ip: SRP_IP },
  { name: "srp-twotone", board: ["Jh", "Th", "5c"], startPot: 5.5, stack: 97.5, oop: SRP_OOP, ip: SRP_IP },
  { name: "real-dry", board: ["Kh", "7s", "2d"], ...REAL_SPOT },
  { name: "real-twotone", board: ["Jh", "Th", "5c"], ...REAL_SPOT },
  { name: "real-monotone", board: ["Ah", "9h", "4h"], ...REAL_SPOT },
  { name: "real-paired", board: ["8s", "8d", "3c"], ...REAL_SPOT },
  { name: "real-holdout-dry", board: ["Qd", "9c", "4s"], ...REAL_SPOT },
  { name: "real-holdout-twotone", board: ["Ts", "9s", "3h"], ...REAL_SPOT },
  { name: "real-holdout-low", board: ["6d", "5d", "4c"], ...REAL_SPOT },
  { name: "real-turn-dry", board: ["Kh", "7s", "2d", "9c"], ...REAL_SPOT },
  { name: "real-turn-flushdraw", board: ["Kh", "7h", "2d", "4c"], ...REAL_SPOT },
  { name: "real-turn-paired", board: ["Kh", "7s", "2d", "7c"], ...REAL_SPOT },
];

const everyCard: HandTreeOptions = { laterStreetSizing: LOOKAHEAD_BET_SIZING };

const FLOP_METHODS = ["checkdown", "K10", "K10xM6", "C16xM6", "Kall"];
const TURN_METHODS = ["checkdown", "M6", "M12", "M24"];

function methodOptions(name: string, features?: (card: string) => Float32Array): HandTreeOptions | null {
  if (name === "checkdown") return null;
  const match = /^(?:([KC])(\d+|all))?x?(?:M(\d+|all))?$/.exec(name);
  if (!match) throw new Error(`unknown method ${name}`);
  const [, picker, turns, rivers] = match;
  return {
    dealNextCards: (board) => {
      const count = board.length === 3 ? turns : rivers;
      if (count === "all") return dealEveryCard(board);
      if (board.length === 3 && picker === "C") return clusteredNextCards(board, Number(count), features!);
      return stratifiedNextCards(board, Number(count));
    },
    laterStreetSizing: LOOKAHEAD_BET_SIZING,
    lastStreet: rivers ? "river" : "turn",
  };
}

function rangeOf(hands: string | HandWeights, board: string[]): ComboRange {
  const weights = typeof hands === "string" ? Object.fromEntries(hands.split(" ").map((h) => [h, 1])) : hands;
  return expandToCombos(
    ALL_HANDS.filter((h) => h.hand in weights).map((h) => ({ hand: h.hand, fold: 0, call: weights[h.hand], raise: 0 })),
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

interface Tables {
  rootEquityTable?: EquityTable;
  equityTableFor?: (board: string[]) => Float32Array | undefined;
}

type StrategyOf = (node: DecisionNode) => number[][];

interface Solved {
  tree: PostflopTreeNode;
  session: NativeSolveSession;
  sec: number;
}

function solve(
  solver: SolverModule,
  tables: Tables,
  spot: Spot,
  hero: ComboRange,
  villain: ComboRange,
  options: HandTreeOptions | null,
  target: number,
  existingTree?: PostflopTreeNode,
  locks: StrategyLock[] = [],
): Solved {
  const t0 = performance.now();
  const tree =
    existingTree ??
    (options ? buildHandTree(spot.startPot, spot.stack, spot.board, options) : buildStreetTree(spot.startPot, spot.stack, streetForBoardLength(spot.board.length)));
  console.error(`  tree ${countNodes(tree)} nodes, ${((performance.now() - t0) / 1000).toFixed(1)}s`);
  const input = { tree, board: spot.board, heroRange: hero, villainRange: villain, ...tables };
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
function strategyDistance(tree: PostflopTreeNode, reference: StrategyOf, method: Solved, hero: ComboRange, villain: ComboRange): number[] {
  const distance = [0, 0];
  const mass = [0, 0];
  const walk = (a: PostflopTreeNode, b: PostflopTreeNode, reach: number[][]) => {
    if (a.type !== "decision" || b.type !== "decision") return;
    const p = a.actor === "P1" ? 0 : 1;
    const want = reference(a);
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
  walk(tree, method.tree, [hero.map((c) => c.weight), villain.map((c) => c.weight)]);
  return distance.map((d, p) => d / mass[p]);
}

/** One player's root-street strategy from `solved`, as locks on the same decisions of the reference tree. */
function rootStreetLocks(reference: PostflopTreeNode, tree: PostflopTreeNode, strategyOf: StrategyOf, actor: "P1" | "P2"): StrategyLock[] {
  const locks: StrategyLock[] = [];
  const walk = (a: PostflopTreeNode, b: PostflopTreeNode) => {
    if (a.type !== "decision" || b.type !== "decision") return;
    if (a.actor === actor) locks.push({ node: a, strategy: strategyOf(b) });
    a.actions.forEach(({ child }, k) => walk(child, b.actions[k].child));
  };
  walk(reference, tree);
  return locks;
}

const percent = (x: number) => (x * 100).toFixed(1);

/** The ranges reaching the turn of `spot` through a check-check on the flop, on the app's quick flop solve. */
function checkedDownRanges(solver: SolverModule, spot: Spot): { hero: ComboRange; villain: ComboRange } {
  const flopSpot = { ...spot, board: spot.board.slice(0, 3) };
  const hero = rangeOf(spot.oop, flopSpot.board);
  const villain = rangeOf(spot.ip, flopSpot.board);
  const runout = RunoutEquity.create(solver, hero, villain, flopSpot.board);
  const solved = solve(solver, flopTables(runout), flopSpot, hero, villain, methodOptions("K10"), APP_TARGET_PERCENT);
  const root = solved.tree as DecisionNode;
  const rootCheck = solved.session.solution.getAverageStrategy(root);
  const afterCheck = solved.session.solution.getAverageStrategy(root.actions[0].child as DecisionNode);
  const narrowed = {
    hero: filterBlockedCombos(hero.map((c, i) => ({ ...c, weight: c.weight * rootCheck[i][0] })).filter((c) => c.weight > 0), spot.board),
    villain: filterBlockedCombos(villain.map((c, j) => ({ ...c, weight: c.weight * afterCheck[j][0] })).filter((c) => c.weight > 0), spot.board),
  };
  solved.session.dispose();
  runout.dispose();
  return narrowed;
}

function flopTables(runout: RunoutEquity): Tables {
  return { rootEquityTable: runout.flopTable(), equityTableFor: (board) => (board.length === 4 ? runout.turnTable(board[3]) : undefined) };
}

function argList(flag: string): string[] | undefined {
  const at = process.argv.indexOf(flag);
  return at < 0 ? undefined : process.argv[at + 1].split(",");
}

/** How the player behind plays once checked to, as "action percent" pairs: where a lookahead's bet sizes go wrong. */
function afterCheckFrequencies(solved: Solved, villain: ComboRange): string {
  const check = (solved.tree as DecisionNode).actions[0].child;
  if (check.type !== "decision") return "";
  const freq = rootFrequencies(check, solved.session.solution, villain);
  return check.actions.map((a, k) => `${a.action} ${percent(freq[k])}`).join(" · ");
}

// --size-pick: would a flop menu picked for the spot do as well as a fixed one?
// The reference is the complete tree on every candidate size plus all-in. A
// method's flop strategy is locked into it with the sizes it lacks at zero; the
// locked player answers freely where the opponent uses a size the method lacks.
//   cur3    the fixed 33/50/100% and all-in the app had before
//   all4    every candidate, no picking
//   pick2   what the app does (flopSizing.ts): a fast flop (K10) on every candidate picks each player's sizes, then the default solve on those
//   oracle2 the same pick made from the reference instead, run when it differs: what a perfect pick would give
/** The fixed flop menu the app had before it picked sizes. */
const FIXED_THREE: StreetBetSizing = { betPotFractions: [0.33, 0.5, 1.0], raisePotFractions: [1.0] };

const SHALLOW_SPOTS: Spot[] = [
  { name: "shallow-1.9-dry", board: ["Kh", "7s", "2d"], startPot: 17, stack: 31.5, oop: THREE_BET_OOP, ip: THREE_BET_IP },
  { name: "shallow-1.9-twotone", board: ["Jh", "Th", "5c"], startPot: 17, stack: 31.5, oop: THREE_BET_OOP, ip: THREE_BET_IP },
  { name: "shallow-1.2-twotone", board: ["Jh", "Th", "5c"], startPot: 20, stack: 24, oop: THREE_BET_OOP, ip: THREE_BET_IP },
];

/** An opening decision's play as text, e.g. "check 40.0 · 33% 50.0 · 75% 10.0". */
function openingText(node: DecisionNode, solution: CfrSolution, range: ComboRange): string {
  const freq = rootFrequencies(node, solution, range);
  return node.actions
    .map(({ action, child }, k) => `${action === "bet" ? `${Math.round((100 * child.state.committed[node.actor]) / totalPot(node.state))}%` : action} ${percent(freq[k])}`)
    .join(" · ");
}

/** Both players' opening play on the flop (the root, and the decision after its check), and the sizes the app would keep from it. */
function describeOpenings(solved: Solved, hero: ComboRange, villain: ComboRange) {
  const root = solved.tree as DecisionNode;
  return {
    oop: openingText(root, solved.session.solution, hero),
    ip: openingText(root.actions[0].child as DecisionNode, solved.session.solution, villain),
    picks: pickFlopSizes(solved.tree, solved.session.solution, hero, villain),
  };
}

const actionKey = (node: DecisionNode, k: number) => `${node.actions[k].action}:${node.actions[k].child.state.committed[node.actor].toFixed(4)}`;

/** One player's root-street strategy from `tree`, as locks on the reference's decisions that `tree` also has; reference actions `tree` lacks get zero. */
function mappedLocks(reference: PostflopTreeNode, tree: PostflopTreeNode, strategyOf: StrategyOf, actor: PostflopPlayer): StrategyLock[] {
  const locks: StrategyLock[] = [];
  const walk = (a: PostflopTreeNode, b: PostflopTreeNode) => {
    if (a.type !== "decision" || b.type !== "decision") return;
    const referenceIndex = new Map(a.actions.map((_, k) => [actionKey(a, k), k]));
    const to = b.actions.map((_, j) => {
      const k = referenceIndex.get(actionKey(b, j));
      if (k === undefined) throw new Error(`the reference has no ${actionKey(b, j)}`);
      return k;
    });
    if (a.actor === actor) {
      const strategy = strategyOf(b).map((row) => {
        const mapped = new Array<number>(a.actions.length).fill(0);
        row.forEach((p, j) => (mapped[to[j]] += p));
        return mapped;
      });
      locks.push({ node: a, strategy });
    }
    to.forEach((k, j) => walk(a.actions[k].child, b.actions[j].child));
  };
  walk(reference, tree);
  return locks;
}

const sizesText = (sizes: number[]) => sizes.map((f) => Math.round(f * 100)).join("/");
const picksText = (picks: OpenSizes) => `OOP ${sizesText(picks.P1)} · IP ${sizesText(picks.P2)}`;

function sizePickExperiment(solver: SolverModule) {
  const wanted = argList("--spots") ?? [];
  let noiseChecked = false;
  for (const spot of [...SPOTS, ...SHALLOW_SPOTS].filter((s) => s.board.length === 3 && wanted.includes(s.name))) {
    const hero = rangeOf(spot.oop, spot.board);
    const villain = rangeOf(spot.ip, spot.board);
    console.error(`${spot.name}: ${hero.length}x${villain.length} combos`);
    const runout = RunoutEquity.create(solver, hero, villain, spot.board);
    const tables = flopTables(runout);
    const features = (card: string) => runout.turnFeatures(card, hero, villain);
    const spr = spot.stack / spot.startPot;
    const allinOpen = offersOpeningAllin(spot.startPot, spot.stack);
    const every = EVERY_CANDIDATE;
    const build = (sizing: StreetSizing | undefined, options: HandTreeOptions) =>
      buildHandTree(spot.startPot, spot.stack, spot.board, { ...options, firstStreetSizing: sizing });

    if (process.argv.includes("--time-only")) {
      // No reference (a real-range one with every candidate passes WASM's 4GB): how long each method takes and what it plays.
      console.log(`\n## ${spot.name} ${spot.board.join(" ")} (${hero.length}x${villain.length} combos, stack ${spr.toFixed(1)} pots)`);
      console.log("method | pick sec | solve sec | total sec | sizes | OOP | IP after check");
      const time = (name: string, sizing: StreetSizing | undefined, sizes: string, pickSec = 0) => {
        const solved = solve(solver, tables, spot, hero, villain, everyCard, APP_TARGET_PERCENT, build(sizing, methodOptions("C16xM6", features)!));
        const openings = describeOpenings(solved, hero, villain);
        console.log([name, pickSec.toFixed(1), solved.sec.toFixed(1), (pickSec + solved.sec).toFixed(1), sizes, openings.oop, openings.ip].join(" | "));
        solved.session.dispose();
      };
      time("cur3", FIXED_THREE, "33/50/100 + all-in");
      time("old2", { betPotFractions: [0.5, 1.0], raisePotFractions: [1.0] }, "50/100 + all-in");
      time("all4", flopMenu(every, allinOpen), `33/50/75/100${allinOpen ? " + all-in" : ""}`);
      const fast = solve(solver, tables, spot, hero, villain, everyCard, APP_TARGET_PERCENT, build(flopMenu(every, allinOpen), methodOptions("K10", features)!));
      const picks = describeOpenings(fast, hero, villain).picks;
      fast.session.dispose();
      time("pick2", flopMenu(picks, allinOpen), `${picksText(picks)}${allinOpen ? " + all-in" : ""}`, fast.sec);
      runout.dispose();
      continue;
    }

    const reference = solve(solver, tables, spot, hero, villain, everyCard, REFERENCE_TARGET_PERCENT, build(flopMenu(every, true), everyCard));
    const refReport = reference.session.solution.finalExploitability!;
    const refOpenings = describeOpenings(reference, hero, villain);
    console.log(`\n## ${spot.name} ${spot.board.join(" ")} (${hero.length}x${villain.length} combos, stack ${spr.toFixed(1)} pots)`);
    console.log(`reference: ${reference.sec.toFixed(0)}s, ${reference.session.solution.iterations} iterations, ${refReport.percentOfPot.toFixed(3)}% exploitable, ${countNodes(reference.tree)} nodes`);
    console.log(`reference OOP: ${refOpenings.oop}`);
    console.log(`reference IP after check: ${refOpenings.ip}`);
    console.log(`pick from the reference: ${picksText(refOpenings.picks)}`);
    const rootStreet = new Map<DecisionNode, number[][]>();
    (function keep(node: PostflopTreeNode) {
      if (node.type !== "decision") return;
      rootStreet.set(node, reference.session.solution.getAverageStrategy(node));
      node.actions.forEach(({ child }) => keep(child));
    })(reference.tree);
    reference.session.dispose();

    const losses = (tree: PostflopTreeNode, strategyOf: StrategyOf) =>
      (["P1", "P2"] as const).map((actor) => {
        const locked = solve(solver, tables, spot, hero, villain, everyCard, LOCKED_TARGET_PERCENT, reference.tree, mappedLocks(reference.tree, tree, strategyOf, actor));
        const report = locked.session.solution.finalExploitability!;
        locked.session.dispose();
        return (100 * (actor === "P1" ? refReport.p1ActualBb - report.p1ActualBb : refReport.p2ActualBb - report.p2ActualBb)) / spot.startPot;
      });

    console.log("method | pick sec | solve sec | total sec | sizes | OOP loss (% pot) | IP loss (% pot) | loss sum | OOP | IP after check");
    if (!noiseChecked) {
      const [oop, ip] = losses(reference.tree, (node) => rootStreet.get(node)!);
      console.log(["reference", "", "", "", "", oop.toFixed(2), ip.toFixed(2), (oop + ip).toFixed(2), "", ""].join(" | "));
      noiseChecked = true;
    }
    const run = (name: string, sizing: StreetSizing | undefined, sizes: string, pickSec = 0) => {
      console.error(name);
      const solved = solve(solver, tables, spot, hero, villain, everyCard, APP_TARGET_PERCENT, build(sizing, methodOptions("C16xM6", features)!));
      const openings = describeOpenings(solved, hero, villain);
      const [oop, ip] = losses(solved.tree, (node) => solved.session.solution.getAverageStrategy(node));
      console.log(
        [name, pickSec.toFixed(1), solved.sec.toFixed(1), (pickSec + solved.sec).toFixed(1), sizes, oop.toFixed(2), ip.toFixed(2), (oop + ip).toFixed(2), openings.oop, openings.ip].join(" | "),
      );
      solved.session.dispose();
    };

    run("cur3", FIXED_THREE, "33/50/100 + all-in");
    run("all4", flopMenu(every, allinOpen), `33/50/75/100${allinOpen ? " + all-in" : ""}`);
    console.error("pick (K10)");
    const fast = solve(solver, tables, spot, hero, villain, everyCard, APP_TARGET_PERCENT, build(flopMenu(every, allinOpen), methodOptions("K10", features)!));
    const picks = describeOpenings(fast, hero, villain).picks;
    fast.session.dispose();
    run("pick2", flopMenu(picks, allinOpen), `${picksText(picks)}${allinOpen ? " + all-in" : ""}`, fast.sec);
    if (picksText(picks) !== picksText(refOpenings.picks)) run("oracle2", flopMenu(refOpenings.picks, allinOpen), `${picksText(refOpenings.picks)}${allinOpen ? " + all-in" : ""}`);
    runout.dispose();
  }
  process.exit(0);
}

async function main() {
  const wanted = argList("--spots");
  const solver = await loadNodeThreadedSolverModule(THREADS);
  if (process.argv.includes("--size-pick")) return sizePickExperiment(solver);
  for (const spot of SPOTS.filter((s) => (wanted ? wanted.includes(s.name) : !s.name.startsWith("real-")))) {
    const isFlop = spot.board.length === 3;
    const { hero, villain } = isFlop ? { hero: rangeOf(spot.oop, spot.board), villain: rangeOf(spot.ip, spot.board) } : checkedDownRanges(solver, spot);
    console.error(`${spot.name}: ${hero.length}x${villain.length} combos`);
    const runout = isFlop ? RunoutEquity.create(solver, hero, villain, spot.board) : null;
    const tables = runout ? flopTables(runout) : {};

    const reference = solve(solver, tables, spot, hero, villain, everyCard, REFERENCE_TARGET_PERCENT);
    const refReport = reference.session.solution.finalExploitability!;
    const root = reference.tree as DecisionNode;
    const refFreq = rootFrequencies(root, reference.session.solution, hero);
    console.log(`\n## ${spot.name} ${spot.board.join(" ")} (${hero.length}x${villain.length} combos)`);
    console.log(`reference: ${reference.sec.toFixed(0)}s, ${reference.session.solution.iterations} iterations, ${refReport.percentOfPot.toFixed(3)}% exploitable`);
    console.log(`root ${root.actions.map((a, k) => `${a.action} ${percent(refFreq[k])}`).join(" · ")}, OOP EV ${refReport.p1ActualBb.toFixed(3)}bb`);
    console.log(`IP after check: ${afterCheckFrequencies(reference, villain)}`);
    console.log("method | sec | root freq max diff (pts) | OOP EV diff (% pot) | IP EV diff (% pot) | OOP strategy distance | IP strategy distance | exploitable | OOP loss (% pot) | IP loss (% pot) | IP after check");
    // Every solve below shares the WASM memory limit, so keep only the reference's root-street strategies.
    const rootStreet = new Map<DecisionNode, number[][]>();
    (function keep(node: PostflopTreeNode) {
      if (node.type !== "decision") return;
      rootStreet.set(node, reference.session.solution.getAverageStrategy(node));
      node.actions.forEach(({ child }) => keep(child));
    })(reference.tree);
    reference.session.dispose();
    const referenceStrategy: StrategyOf = (node) => rootStreet.get(node)!;

    /** What keeping `tree`'s root-street strategy costs each player against the reference, in % of the pot. */
    const losses = (tree: PostflopTreeNode, strategyOf: StrategyOf) =>
      (["P1", "P2"] as const).map((actor) => {
        const locked = solve(solver, tables, spot, hero, villain, everyCard, LOCKED_TARGET_PERCENT, reference.tree, rootStreetLocks(reference.tree, tree, strategyOf, actor));
        const report = locked.session.solution.finalExploitability!;
        locked.session.dispose();
        const drop = actor === "P1" ? refReport.p1ActualBb - report.p1ActualBb : refReport.p2ActualBb - report.p2ActualBb;
        return ((100 * drop) / spot.startPot).toFixed(2);
      });
    console.log(["reference", "", "", "", "", "", "", "", ...losses(reference.tree, referenceStrategy), ""].join(" | "));
    for (const name of argList("--methods") ?? (isFlop ? FLOP_METHODS : TURN_METHODS)) {
      console.error(name);
      const features = runout ? (card: string) => runout.turnFeatures(card, hero, villain) : undefined;
      const solved = solve(solver, tables, spot, hero, villain, methodOptions(name, features), APP_TARGET_PERCENT);
      const report = solved.session.solution.finalExploitability!;
      const freq = rootFrequencies(solved.tree as DecisionNode, solved.session.solution, hero);
      const freqDiff = Math.max(...freq.map((f, k) => Math.abs(f - refFreq[k])));
      const [oop, ip] = strategyDistance(reference.tree, referenceStrategy, solved, hero, villain);
      console.log(
        [
          name,
          solved.sec.toFixed(1),
          percent(freqDiff),
          ((100 * (report.p1ActualBb - refReport.p1ActualBb)) / spot.startPot).toFixed(2),
          ((100 * (report.p2ActualBb - refReport.p2ActualBb)) / spot.startPot).toFixed(2),
          percent(oop),
          percent(ip),
          `${report.percentOfPot.toFixed(2)}%`,
          ...losses(solved.tree, (node) => solved.session.solution.getAverageStrategy(node)),
          afterCheckFrequencies(solved, villain),
        ].join(" | "),
      );
      solved.session.dispose();
    }
    runout?.dispose();
  }
  process.exit(0);
}

void main();
