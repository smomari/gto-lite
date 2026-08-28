import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadEquityMatrix } from "../lib/equity/loadEquityMatrix";
import { computePercentileRanking } from "../lib/equity/handStrength";
import {
  generateRfiScenario,
  generateThreeWayScenario,
  generateVs3BetScenario,
} from "../lib/heuristicRanges/generateScenario";
import {
  RFI_THRESHOLD,
  VS_OPEN_OPENER,
  VS_OPEN_CONTINUE_THRESHOLD,
  VS_OPEN_RAISE_FRACTION,
  VS_3BET_BETTOR,
  VS_3BET_CONTINUE_THRESHOLD,
  VS_3BET_FOURBET_FRACTION,
  SQUEEZE_CONTINUE_THRESHOLD,
  SQUEEZE_RAISE_FRACTION,
} from "../lib/heuristicRanges/config";
import { buildNodeId } from "../lib/actionTree/nodeId";
import type { ActionNode, HandFrequency, Position, RangeScenario } from "../types/rangeData";

const OUTPUT_ROOT = resolve(__dirname, "../public/data/ranges/heuristic-approx");
const VERSION = "1.0.0";
const STACK_DEPTHS = [40, 100];

const RFI_POSITIONS: Position[] = ["UTG", "MP", "CO", "BTN", "SB"];
const VS_OPEN_POSITIONS: Position[] = ["MP", "CO", "BTN", "SB", "BB"];
const VS_3BET_POSITIONS: Position[] = ["UTG", "MP", "CO", "BTN", "SB"];

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
    source: "heuristic-approx",
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
  const ranking = computePercentileRanking(loadEquityMatrix());

  for (const stackDepth of STACK_DEPTHS) {
    for (const pos of RFI_POSITIONS) {
      const hands = generateRfiScenario(ranking, RFI_THRESHOLD[pos]!);
      writeScenario(stackDepth, pos, [], hands);
    }

    for (const pos of VS_OPEN_POSITIONS) {
      const opener = VS_OPEN_OPENER[pos]!;
      const hands = generateThreeWayScenario(
        ranking,
        VS_OPEN_CONTINUE_THRESHOLD[pos]!,
        VS_OPEN_RAISE_FRACTION,
      );
      writeScenario(stackDepth, pos, [{ actor: opener, action: "raise", label: "open" }], hands);
    }

    for (const pos of VS_3BET_POSITIONS) {
      const threeBettor = VS_3BET_BETTOR[pos]!;
      const hands = generateVs3BetScenario(
        ranking,
        VS_3BET_CONTINUE_THRESHOLD[pos]!,
        VS_3BET_FOURBET_FRACTION,
      );
      writeScenario(
        stackDepth,
        pos,
        [
          { actor: pos, action: "raise", label: "open" },
          { actor: threeBettor, action: "raise", label: "3bet" },
        ],
        hands,
      );
    }

    // Squeeze: BB facing BTN-open + SB-cold-call.
    const squeezeHands = generateThreeWayScenario(
      ranking,
      SQUEEZE_CONTINUE_THRESHOLD,
      SQUEEZE_RAISE_FRACTION,
    );
    writeScenario(
      stackDepth,
      "BB",
      [
        { actor: "BTN", action: "raise", label: "open" },
        { actor: "SB", action: "call", label: "cold-call" },
      ],
      squeezeHands,
    );
  }

  console.log("Done.");
}

main();
