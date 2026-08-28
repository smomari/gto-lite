import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { ALL_HANDS } from "../lib/handRange/handList";
import { loadEquityMatrix } from "../lib/equity/loadEquityMatrix";
import { solvePushFold, type FrequencyMap } from "../lib/nashSolver/pushFoldSolver";
import { buildNodeId } from "../lib/actionTree/nodeId";
import { VS_4BET_EFFECTIVE_STACK_FACTOR } from "../lib/heuristicRanges/config";
import type { ActionNode, HandFrequency, Position, RangeScenario } from "../types/rangeData";

const OUTPUT_ROOT = resolve(__dirname, "../public/data/ranges/nash-shove-fold");
const VERSION = "1.0.0";

const RFI_POSITIONS: Position[] = ["UTG", "MP", "CO", "BTN", "SB"];
const VS_OPEN_FACING: Partial<Record<Position, Position>> = {
  MP: "UTG",
  CO: "MP",
  BTN: "CO",
  SB: "BTN",
  BB: "SB",
};
const VS_4BET_OPENERS: Position[] = ["UTG", "MP", "CO", "BTN"];

function shoveFrequencyToHands(shoveFreq: FrequencyMap): HandFrequency[] {
  return ALL_HANDS.map((h) => {
    const shove = shoveFreq.get(h.hand) ?? 0;
    return { hand: h.hand, fold: 1 - shove, call: 0, raise: 0, allin: shove };
  });
}

function callFrequencyToHands(callFreq: FrequencyMap): HandFrequency[] {
  return ALL_HANDS.map((h) => {
    const call = callFreq.get(h.hand) ?? 0;
    return { hand: h.hand, fold: 1 - call, call, raise: 0 };
  });
}

function writeScenario(
  stackDepth: number,
  heroPosition: Position,
  actionPath: ActionNode[],
  hands: HandFrequency[],
) {
  const nodeId = buildNodeId(actionPath);
  const scenario: RangeScenario = {
    heroPosition,
    stackDepth,
    nodeId,
    actionPath,
    source: "nash-shove-fold",
    generatedAt: new Date().toISOString(),
    version: VERSION,
    hands,
  };
  const path = resolve(OUTPUT_ROOT, String(stackDepth), heroPosition, `${nodeId}.json`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(scenario, null, 2));
  console.log(`  wrote ${path.replace(resolve(__dirname, ".."), ".")}`);
}

function main() {
  const matrix = loadEquityMatrix();

  console.log("Solving 20bb push/fold subgame...");
  const solve20 = solvePushFold(matrix, { effectiveStackBb: 20 });

  for (const pos of RFI_POSITIONS) {
    writeScenario(20, pos, [], shoveFrequencyToHands(solve20.shoveFrequency));
  }
  for (const [pos, opener] of Object.entries(VS_OPEN_FACING) as [Position, Position][]) {
    writeScenario(
      20,
      pos,
      [{ actor: opener, action: "raise", label: "open" }],
      callFrequencyToHands(solve20.callFrequency),
    );
  }

  for (const stackDepth of [40, 100]) {
    const reducedStack = Math.round(stackDepth * VS_4BET_EFFECTIVE_STACK_FACTOR);
    console.log(`Solving vs-4bet subgame at ${stackDepth}bb (reduced stack ${reducedStack}bb)...`);
    const solveVs4Bet = solvePushFold(matrix, { effectiveStackBb: reducedStack });

    for (const opener of VS_4BET_OPENERS) {
      writeScenario(
        stackDepth,
        "BB",
        [
          { actor: opener, action: "raise", label: "open" },
          { actor: "BB", action: "raise", label: "3bet" },
          { actor: opener, action: "raise", label: "4bet" },
        ],
        callFrequencyToHands(solveVs4Bet.callFrequency),
      );
    }
  }

  console.log("Done.");
}

main();
