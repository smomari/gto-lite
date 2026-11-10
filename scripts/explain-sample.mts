// Plays representative hands through the real solvers and prints each hand's explain summary and its size.
// Each decision takes the line's most frequent non-fold action, so hands reach the river.
// With --model, also asks that model (a Gateway model id, or "default") for each explanation; needs AI_GATEWAY_API_KEY.
// Usage: npx tsx scripts/explain-sample.mts [--json] [--model default|<provider/model>] [--lang ko|en]
import { loadEquityMatrix } from "@/lib/equity/loadEquityMatrix";
import { replayActionPath } from "@/lib/solveEngine/replay";
import { solveActiveSeat } from "@/lib/solveEngine/solve";
import { TOURNAMENT_8 } from "@/lib/solveEngine/gameFormat";
import { CHIP_EV } from "@/lib/solveEngine/icm";
import { NO_RAKE_SETTINGS } from "@/lib/solveEngine/rake";
import { actionPathKey, resolvePostflopHandoff } from "@/lib/solveEngine/postflopHandoff";
import { solvePostflopStreet } from "@/lib/postflopSolver/solvePostflop";
import { serializeCombos, serializeTree } from "@/lib/postflopSolver/serialize";
import { computeCheckdownEquities } from "@/lib/postflopSolver/checkdownEquity";
import { loadNodeThreadedSolverModule } from "@/lib/postflopSolver/wasm/loadNode";
import { toSolveInput } from "@/lib/postflopSolver/worker/solveInput";
import { narrowRangeAlongPath, type TreePathStep } from "@/lib/postflopSolver/rangeNarrowing";
import { buildStreetSolveRequest, idleStage, type StreetSolveInputs, type StreetStage } from "@/components/PostflopBoard/streetStages";
import { buildHandSummary, type ExplainStreetInput } from "@/lib/explain/buildHandSummary";
import { handSummarySchema } from "@/lib/explain/summarySchema";
import { streamExplanation } from "@/lib/explain/model";
import type { PostflopResultMessage, SerializedTreeNode } from "@/types/postflopSolver";
import type { ActionType, Position } from "@/types/rangeData";
import type { SolveResponse } from "@/types/solveApi";

const THREADS = 10;
const m = loadEquityMatrix();
const solver = await loadNodeThreadedSolverModule(THREADS);
const printJson = process.argv.includes("--json");
const argAfter = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
};
const modelArg = argAfter("--model");
const language = argAfter("--lang") === "en" ? "en" : "ko";

const FOLDS: [Position, ActionType][] = (["UTG", "UTG1", "LJ", "HJ", "CO"] as Position[]).map((s) => [s, "fold"]);
const SPOTS: { name: string; stack: number; line: [Position, ActionType][]; board: string[] }[] = [
  { name: "BTN open, BB call", stack: 100, line: [...FOLDS, ["BTN", "raise"], ["SB", "fold"], ["BB", "call"]], board: ["Kh", "7s", "2d", "9c", "4h"] },
  { name: "BB 3-bet, BTN call", stack: 40, line: [...FOLDS, ["BTN", "raise"], ["SB", "fold"], ["BB", "raise"], ["BTN", "call"]], board: ["9h", "8h", "4c", "Qs", "2h"] },
  { name: "CO open, BTN call", stack: 60, line: [...FOLDS.slice(0, 4), ["CO", "raise"], ["BTN", "call"], ["SB", "fold"], ["BB", "fold"]], board: ["As", "Td", "5c", "5h", "Jd"] },
];

function solveStreet(stage: StreetStage, request: ReturnType<typeof buildStreetSolveRequest>): PostflopResultMessage {
  const result = solvePostflopStreet(toSolveInput(request), { solver, threads: THREADS });
  const checkdown = computeCheckdownEquities(result.tree, result.solution, result.heroRange, result.villainRange, result.equityTable, request.rake);
  const tree = serializeTree(result.tree, result.solution, checkdown, result.session?.nextStreetEv());
  result.session?.dispose();
  return { type: "result", tree, heroRange: serializeCombos(result.heroRange), villainRange: serializeCombos(result.villainRange), iterations: result.solution.iterations, exploitability: result.exploitability };
}

/** Follows the most frequent non-fold action of the acting range from `tree` until the street ends. */
function playStreet(result: PostflopResultMessage): { path: TreePathStep[]; end: SerializedTreeNode } {
  const path: TreePathStep[] = [];
  let node = result.tree;
  while (node.type === "decision") {
    const range = narrowRangeAlongPath(node.actor === "P1" ? result.heroRange : result.villainRange, node.actor, path);
    const mass = node.actions.map((_, a) => range.reduce((s, c, i) => s + c.weight * (node.type === "decision" ? (node.strategy[i]?.[a] ?? 0) : 0), 0));
    const order = mass.map((w, a) => ({ w, a })).sort((x, y) => y.w - x.w).filter(({ a }) => node.type === "decision" && node.actions[a].action !== "fold");
    const actionIndex = order[0]?.a ?? 0;
    path.push({ node, actionIndex });
    node = node.actions[actionIndex].child;
  }
  return { path, end: node };
}

for (const spot of SPOTS) {
  const started = performance.now();
  const steps = spot.line.map(([actor, action]) => ({ actor, action }));
  const responses: Record<string, SolveResponse> = {};
  spot.line.forEach((_, i) => {
    const replayed = replayActionPath(steps.slice(0, i), spot.stack, TOURNAMENT_8);
    if (replayed.status !== "active") throw new Error("inactive");
    const solved = solveActiveSeat(m, replayed.activeSeat, replayed.potState, spot.stack, NO_RAKE_SETTINGS, CHIP_EV);
    responses[actionPathKey(steps.slice(0, i))] = { ...solved, heroPosition: replayed.activeSeat } as SolveResponse;
  });
  const final = replayActionPath(steps, spot.stack, TOURNAMENT_8);
  if (final.status !== "resolved") throw new Error("not resolved");
  const handoff = resolvePostflopHandoff(final.canonicalActionPath, final.potState.committed, spot.stack, responses);
  if (!handoff.matchup) throw new Error("no heads-up matchup");
  const [p1, p2] = handoff.matchup;
  const inputs: StreetSolveInputs = {
    heroHands: p1.hands,
    heroActionKey: p1.actionKey,
    villainHands: p2.hands,
    villainActionKey: p2.actionKey,
    startPot: final.potState.potBb,
    effectiveStackBb: Math.min(p1.remainingBb, p2.remainingBb),
    rake: NO_RAKE_SETTINGS.structure,
  };

  const streets: StreetStage[] = [];
  const explained: ExplainStreetInput[] = [];
  let stack = inputs.effectiveStackBb;
  let end: SerializedTreeNode | null = null;
  for (let k = 0; k < 3; k++) {
    const stage = idleStage(3 + k, stack);
    const cards = k === 0 ? spot.board.slice(0, 3) : [spot.board[2 + k]];
    const result = solveStreet(stage, buildStreetSolveRequest(streets, k, cards, inputs, true));
    const played = playStreet(result);
    const board = k === 0 ? cards : [...streets[k - 1].board, ...cards];
    streets.push({ ...stage, board, state: { kind: "done", result }, currentNode: played.end, path: played.path });
    explained.push({ board, effectiveStackAtStart: stack, result, path: played.path });
    end = played.end;
    if (end.type !== "chance") break;
    stack -= end.committed.P1;
  }
  if (!end || end.type === "decision" || end.type === "chance") throw new Error("hand didn't end");

  const summaryStarted = performance.now();
  const summary = buildHandSummary({
    game: { format: TOURNAMENT_8.id, stackBb: spot.stack, rake: "none", icm: "chip-ev" },
    oop: p1.seat,
    ip: p2.seat,
    preflop: { actionPath: final.canonicalActionPath, responses, potBb: final.potState.potBb },
    streets: explained,
    ending: { node: end, allIn: false, rakeBb: 0 },
  });
  const summaryMs = performance.now() - summaryStarted;
  const json = JSON.stringify(summary);
  const valid = handSummarySchema.safeParse(summary).success;
  console.log(`${spot.name} ${spot.stack}bb ${spot.board.join("")}: ${explained.length} streets, ${json.length} bytes (~${Math.round(json.length / 3.2)} tokens), schema ${valid ? "ok" : "FAILED"}, summary ${summaryMs.toFixed(0)}ms, total ${((performance.now() - started) / 1000).toFixed(1)}s`);
  if (printJson) console.log(JSON.stringify(summary, null, 1));
  if (modelArg) {
    const result = streamExplanation(summary, language, modelArg === "default" ? {} : { model: modelArg });
    for await (const text of result.textStream) process.stdout.write(text);
    const usage = await result.usage;
    console.log(`\n[${await result.finishReason}] input ${usage.inputTokens}, output ${usage.outputTokens} (reasoning ${usage.outputTokenDetails?.reasoningTokens ?? "?"})\n`);
  }
}
process.exit(0);
