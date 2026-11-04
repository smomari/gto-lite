/**
 * Stage 1 of the preflop solver: does a preflop CFR with a postflop realization
 * model reproduce GTO Wizard's blind-defense spots well enough to replace the
 * heuristic charts? Fits the realization parameters to one depth and reports
 * the others as holdouts.
 *
 *   npm run proto:preflop                # solve with the defaults
 *   npm run proto:preflop -- --fit       # fit to tournament 100bb first
 *   npm run proto:preflop -- --fit=all   # fit to every spot: can the model fit them at all?
 *   npm run proto:preflop -- --fit --fix=initiativeBonus   # leave some parameters at their defaults
 *
 * Result on 2026-11-04: no-go for the realization model as it stands. The
 * solves converge (best-response gain under 0.0001bb, about 2s each) and the
 * fit spot comes within 1.4pp on average, but the holdouts miss by 4.9pp on
 * average and up to 12.9pp. Fitting all four spots at once still leaves 4.5pp
 * rms, so it is the model's shape, not its fit:
 * - The BB defends almost every hand against the button at 40 and 20bb (GTO
 *   Wizard folds 12%) — its out-of-position penalty doesn't grow with depth
 *   the way the real one does.
 * - From 40bb down the BB 3-bets only all-in, where GTO Wizard keeps a sized
 *   3-bet, so the button's answer to that one is off the path and unscored.
 * - At cash the button flats the BB's 3-bet twice as often (27% vs 14%) and
 *   4-bets less.
 */
import { loadEquityMatrix } from "@/lib/equity/loadEquityMatrix";
import { ALL_HANDS } from "@/lib/handRange/handList";
import { gameFormatById, TOURNAMENT_8, type GameFormat } from "@/lib/solveEngine/gameFormat";
import { DEFAULT_RAKE_SETTINGS, NO_RAKE_SETTINGS, type RakeSettings } from "@/lib/solveEngine/rake";
import { replayActionPath } from "@/lib/solveEngine/replay";
import { solveActiveSeat } from "@/lib/solveEngine/solve";
import type { ActionType, Position } from "@/types/rangeData";
import { exploitability } from "@/lib/preflopSolver/bestResponse";
import { solvePreflop, type PreflopSolution } from "@/lib/preflopSolver/cfr";
import { DEAL_ODDS } from "@/lib/preflopSolver/payoff";
import { DEFAULT_REALIZATION, equityTable, HAND_COUNT, type RealizationParams } from "@/lib/preflopSolver/realization";
import { BLIND_DEFENSE_RULES, buildPreflopTree, nodeAt, type DecisionNode } from "@/lib/preflopSolver/tree";

const matrix = loadEquityMatrix();
const equity = equityTable(matrix);

interface Spot {
  name: string;
  format: GameFormat;
  stackBb: number;
  rake: RakeSettings;
  /** GTO Wizard, from gtoWizardMtt.test.ts and gtoWizardNl10.test.ts: raise (incl. all-in) / call / fold. */
  want: { open: number; sbVsBtn?: number[]; bbVsBtn: number[]; btnVs3bet: number[] };
}

const CASH_6 = gameFormatById("cash-6")!;
const SPOTS: Spot[] = [
  { name: "MTT 100bb", format: TOURNAMENT_8, stackBb: 100, rake: NO_RAKE_SETTINGS, want: { open: 54.4, bbVsBtn: [14.4, 62.8, 22.8], btnVs3bet: [6.4, 36.6, 57.0] } },
  { name: "MTT 40bb", format: TOURNAMENT_8, stackBb: 40, rake: NO_RAKE_SETTINGS, want: { open: 52.0, bbVsBtn: [16.9, 71.2, 11.9], btnVs3bet: [11.1, 38.1, 50.8] } },
  {
    name: "MTT 20bb",
    format: TOURNAMENT_8,
    stackBb: 20,
    rake: NO_RAKE_SETTINGS,
    want: { open: 41.5, sbVsBtn: [25.8, 0.8, 73.4], bbVsBtn: [19.9, 67.8, 12.3], btnVs3bet: [19.7, 37.6, 42.6] },
  },
  {
    name: "Cash 100bb",
    format: CASH_6,
    stackBb: 100,
    rake: DEFAULT_RAKE_SETTINGS,
    want: { open: 40.3, sbVsBtn: [13.6, 2.7, 83.7], bbVsBtn: [13.0, 26.3, 60.7], btnVs3bet: [15.2, 13.8, 71.0] },
  },
];
const FIT_ALL = process.argv.includes("--fit=all");
const FIT_SPOTS = FIT_ALL ? SPOTS : [SPOTS[0]];

const pct = (freq: Float64Array, weight?: Float64Array) => {
  let num = 0;
  let den = 0;
  for (let i = 0; i < HAND_COUNT; i++) {
    const w = DEAL_ODDS[i] * (weight ? weight[i] : 1);
    num += freq[i] * w;
    den += w;
  }
  return (100 * num) / den;
};

/** [raise incl. all-in, call, fold], % of the hands weighted by `weight` (all of them by default). */
function split(solution: PreflopSolution, node: DecisionNode, weight?: Float64Array): number[] {
  const strategy = solution.strategy(node);
  const sum = (actions: ActionType[]) => {
    const out = new Float64Array(HAND_COUNT);
    node.actions.forEach((a, k) => actions.includes(a.action) && strategy[k].forEach((f, i) => (out[i] += f)));
    return out;
  };
  return [pct(sum(["raise", "allin"]), weight), pct(sum(["call"]), weight), pct(sum(["fold"]), weight)];
}

function frequency(solution: PreflopSolution, node: DecisionNode, actions: ActionType[]): Float64Array {
  const strategy = solution.strategy(node);
  const out = new Float64Array(HAND_COUNT);
  node.actions.forEach((a, k) => actions.includes(a.action) && strategy[k].forEach((f, i) => (out[i] += f)));
  return out;
}

const decision = (solution: PreflopSolution, path: ActionType[]) => {
  const node = nodeAt(solution.tree, path);
  if (node?.kind !== "decision") throw new Error(`no decision at ${path.join("-")}`);
  return node;
};

interface Measured {
  open: number;
  sbVsBtn: number[];
  bbVsBtn: number[];
  btnVs3bet: number[];
  /** Of the BB's 3-bets, the share that are all-in. */
  bbJamShare: number;
  /** The BB's sized 3-bet, % of all hands. Too rare and the button's answer to it is off the path, not worth scoring. */
  bbSized3bet: number;
}

function measure(solution: PreflopSolution): Measured {
  const root = decision(solution, []);
  const openFreq = frequency(solution, root, ["raise", "allin"]);
  const bb = decision(solution, ["raise", "fold"]);
  const raised = frequency(solution, bb, ["raise"]);
  const jammed = frequency(solution, bb, ["allin"]);
  return {
    open: pct(openFreq),
    sbVsBtn: split(solution, decision(solution, ["raise"])),
    bbVsBtn: split(solution, bb),
    btnVs3bet: split(solution, decision(solution, ["raise", "fold", "raise"]), openFreq),
    bbJamShare: (100 * pct(jammed)) / (pct(jammed) + pct(raised)),
    bbSized3bet: pct(raised),
  };
}

function solveSpot(spot: Spot, params: RealizationParams, iterations: number) {
  const tree = buildPreflopTree({ format: spot.format, stackBb: spot.stackBb, rake: spot.rake, seats: ["BTN", "SB", "BB"], rules: BLIND_DEFENSE_RULES });
  return solvePreflop(tree, equity, params, iterations);
}

const OFF_PATH_PCT = 1;

/** [GTO Wizard, solver] pairs that count toward the score. The tournament SB flats a lot at 100 and 40bb, which this tree can't. */
function pairs(spot: Spot, got: Measured): [string, number, number][] {
  const out: [string, number, number][] = [["BTN open", spot.want.open, got.open]];
  const add = (label: string, want: number[] | undefined, have: number[]) =>
    want?.forEach((w, i) => out.push([`${label} ${["raise", "call", "fold"][i]}`, w, have[i]]));
  add("SB vs BTN", spot.want.sbVsBtn, got.sbVsBtn);
  add("BB vs BTN", spot.want.bbVsBtn, got.bbVsBtn);
  if (got.bbSized3bet >= OFF_PATH_PCT) add("BTN vs BB 3bet", spot.want.btnVs3bet, got.btnVs3bet);
  return out;
}

const errors = (spot: Spot, got: Measured) => pairs(spot, got).map(([, want, have]) => Math.abs(have - want));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function fit(start: RealizationParams): RealizationParams {
  const steps: Record<keyof RealizationParams, number> = { oopPenalty: 0.04, suitedBonus: 0.04, connectorBonus: 0.04, equityExponent: 0.2, initiativeBonus: 0.04, halfSpr: 1 };
  const bounds: Record<keyof RealizationParams, [number, number]> = { oopPenalty: [0, 0.6], suitedBonus: [0, 0.5], connectorBonus: [0, 0.5], equityExponent: [0.5, 4], initiativeBonus: [0, 0.5], halfSpr: [0.25, 20] };
  const fixed = (process.argv.find((arg) => arg.startsWith("--fix="))?.slice(6).split(",") ?? []) as (keyof RealizationParams)[];
  for (const key of fixed) delete (steps as Partial<typeof steps>)[key];
  const loss = (p: RealizationParams) => mean(FIT_SPOTS.flatMap((spot) => errors(spot, measure(solveSpot(spot, p, 600)))).map((e) => e * e));
  let best = start;
  let bestLoss = loss(best);
  for (let round = 0; round < 6; round++) {
    let improved = false;
    for (const key of Object.keys(steps) as (keyof RealizationParams)[]) {
      for (const dir of [1, -1]) {
        const value = Math.min(bounds[key][1], Math.max(bounds[key][0], best[key] + dir * steps[key]));
        if (value === best[key]) continue;
        const candidate = { ...best, [key]: value };
        const l = loss(candidate);
        if (l < bestLoss) {
          best = candidate;
          bestLoss = l;
          improved = true;
        }
      }
    }
    console.log(`  round ${round + 1}: rms ${Math.sqrt(bestLoss).toFixed(2)}pp`, JSON.stringify(best, (_, v) => (typeof v === "number" ? Number(v.toFixed(3)) : v)));
    if (!improved) for (const key of Object.keys(steps) as (keyof RealizationParams)[]) steps[key] /= 2;
  }
  return best;
}

/** How alike two ranges are: combo-weighted overlap over union, 1 when identical. */
function overlap(a: Float64Array, b: number[]): number {
  let min = 0;
  let max = 0;
  for (let i = 0; i < HAND_COUNT; i++) {
    min += Math.min(a[i], b[i]) * DEAL_ODDS[i];
    max += Math.max(a[i], b[i]) * DEAL_ODDS[i];
  }
  return max === 0 ? 1 : min / max;
}

/** Our solver's BB 3-bet and BTN 4-bet ranges against the heuristic charts the app serves now. */
function compareToHeuristic(spot: Spot, solution: PreflopSolution) {
  const folds = (["UTG", "UTG1", "LJ", "HJ", "CO"] as Position[]).filter((s) => !spot.format.absentSeats.includes(s));
  const heuristic = (moves: [Position, ActionType][]) => {
    const path = [...folds.map((actor) => ({ actor, action: "fold" as ActionType })), ...moves.map(([actor, action]) => ({ actor, action }))];
    const replay = replayActionPath(path, spot.stackBb, spot.format);
    if (replay.status !== "active") throw new Error("expected a seat to act");
    const hands = solveActiveSeat(matrix, replay.activeSeat, replay.potState, spot.stackBb, spot.rake).hands;
    return ALL_HANDS.map((h) => {
      const f = hands.find((x) => x.hand === h.hand)!;
      return f.raise + (f.allin ?? 0);
    });
  };
  const bb3bet = frequency(solution, decision(solution, ["raise", "fold"]), ["raise", "allin"]);
  const btn4bet = frequency(solution, decision(solution, ["raise", "fold", "raise"]), ["raise", "allin"]);
  const ours3 = heuristic([["BTN", "raise"], ["SB", "fold"]]);
  const ours4 = heuristic([["BTN", "raise"], ["SB", "fold"], ["BB", "raise"]]);
  const differ = (solver: Float64Array, app: number[]) =>
    ALL_HANDS.map((h, i) => ({ hand: h.hand, d: solver[i] - app[i] }))
      .sort((x, y) => Math.abs(y.d) - Math.abs(x.d))
      .slice(0, 8)
      .map((x) => `${x.hand}${x.d > 0 ? "+" : ""}${Math.round(x.d * 100)}`)
      .join(" ");
  console.log(`  vs app heuristic — BB 3bet overlap ${(100 * overlap(bb3bet, ours3)).toFixed(0)}%: ${differ(bb3bet, ours3)}`);
  console.log(`                     BTN 4bet overlap ${(100 * overlap(btn4bet, ours4)).toFixed(0)}%: ${differ(btn4bet, ours4)}`);
}

let params = DEFAULT_REALIZATION;
if (process.argv.some((arg) => arg.startsWith("--fit"))) {
  console.log(`Fitting to ${FIT_SPOTS.map((spot) => spot.name).join(", ")}`);
  params = fit(params);
}
console.log("Realization", JSON.stringify(params, (_, v) => (typeof v === "number" ? Number(v.toFixed(3)) : v)));

const holdout: number[] = [];
for (const spot of SPOTS) {
  const started = performance.now();
  const solution = solveSpot(spot, params, 2000);
  const seconds = (performance.now() - started) / 1000;
  const got = measure(solution);
  const gains = exploitability(solution).map((e) => e.gain);
  console.log(`\n${spot.name}${FIT_SPOTS.includes(spot) ? " (fit)" : " (holdout)"} — ${seconds.toFixed(1)}s, best-response gain ${gains.map((g) => g.toFixed(4)).join("/")}bb, BB 3bets all-in ${got.bbJamShare.toFixed(0)}%`);
  if (got.bbSized3bet < OFF_PATH_PCT) console.log(`  (BTN vs BB 3bet not scored: the BB sized-3bets only ${got.bbSized3bet.toFixed(1)}% of hands)`);
  for (const [label, want, have] of pairs(spot, got)) {
    console.log(`  ${label.padEnd(20)} GTOW ${want.toFixed(1).padStart(5)}  solver ${have.toFixed(1).padStart(5)}  ${(have - want >= 0 ? "+" : "") + (have - want).toFixed(1)}`);
  }
  if (spot.format.id === "tournament-8" && spot.stackBb > 20) console.log(`  (SB vs BTN not scored: ${got.sbVsBtn.map((x) => x.toFixed(1)).join("/")} vs GTOW, which flats)`);
  const e = errors(spot, got);
  console.log(`  mean |err| ${mean(e).toFixed(1)}pp, max ${Math.max(...e).toFixed(1)}pp`);
  if (!FIT_SPOTS.includes(spot)) holdout.push(...e);
  compareToHeuristic(spot, solution);
}
if (holdout.length) console.log(`\nHoldout: mean |err| ${mean(holdout).toFixed(1)}pp, max ${Math.max(...holdout).toFixed(1)}pp over ${holdout.length} numbers`);
