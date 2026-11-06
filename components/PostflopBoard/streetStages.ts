import { narrowRangeAlongPath, type TreePathStep } from "@/lib/postflopSolver/rangeNarrowing";
import { DEFAULT_MAX_CFR_ITERATIONS, DEFAULT_TARGET_EXPLOITABILITY_PERCENT } from "@/lib/postflopSolver/cfr";
import type { RakeStructure } from "@/lib/solveEngine/rake";
import type {
  ActionWeightKey,
  PostflopResultMessage,
  PostflopSolvePhase,
  PostflopSolveRequest,
  SerializedTreeNode,
} from "@/types/postflopSolver";
import type { HandFrequency } from "@/types/rangeData";
import { streetLabelForBoardLength, type StreetLabel } from "./streetLabel";

export type SolveState =
  | { kind: "idle" }
  | { kind: "solving"; phase: PostflopSolvePhase; done: number; total: number; exploitabilityPercent?: number }
  | { kind: "done"; result: PostflopResultMessage }
  | { kind: "error"; message: string };

/**
 * One street's worth of state: board picking, solving, and tree navigation.
 * Kept as an array so flop/turn/river all share the same shape and rendering
 * logic instead of separate per-street fields.
 */
export interface StreetStage {
  streetLabel: StreetLabel;
  /** Cumulative board through this stage (3/4/5 cards for flop/turn/river). */
  board: string[];
  state: SolveState;
  currentNode: SerializedTreeNode | null;
  path: TreePathStep[];
  /** Effective stack behind at the start of this street (before any of this street's action). */
  effectiveStackAtStart: number;
}

/** What the flop's solve starts from: both players' preflop ranges and the pot and stacks they bring. */
export interface StreetSolveInputs {
  heroHands: HandFrequency[];
  heroActionKey: ActionWeightKey;
  villainHands: HandFrequency[];
  villainActionKey: ActionWeightKey;
  startPot: number;
  effectiveStackBb: number;
  rake: RakeStructure;
}

export function idleStage(boardLength: number, effectiveStackAtStart: number): StreetStage {
  return {
    streetLabel: streetLabelForBoardLength(boardLength),
    board: [],
    state: { kind: "idle" },
    currentNode: null,
    path: [],
    effectiveStackAtStart,
  };
}

/**
 * The solve request for stage `stageIndex` once `cards` are picked: the flop
 * starts from the preflop ranges, a later street from the previous street's
 * ranges narrowed along the line that closed it at a chance node.
 */
export function buildStreetSolveRequest(
  streets: StreetStage[],
  stageIndex: number,
  cards: string[],
  inputs: StreetSolveInputs,
  fastFlop: boolean,
): PostflopSolveRequest {
  const solveOptions = {
    maxIterations: DEFAULT_MAX_CFR_ITERATIONS,
    targetExploitabilityPercent: DEFAULT_TARGET_EXPLOITABILITY_PERCENT,
    rake: inputs.rake,
  };
  if (stageIndex === 0) {
    return {
      kind: "canonical",
      board: cards,
      heroHandFrequencies: inputs.heroHands,
      heroActionKey: inputs.heroActionKey,
      villainHandFrequencies: inputs.villainHands,
      villainActionKey: inputs.villainActionKey,
      startPot: inputs.startPot,
      effectiveStackBb: inputs.effectiveStackBb,
      fast: fastFlop,
      ...solveOptions,
    };
  }
  const prevStage = streets[stageIndex - 1];
  const terminal = prevStage.currentNode;
  if (prevStage.state.kind !== "done" || terminal?.type !== "chance") {
    throw new Error("buildStreetSolveRequest: the next street requires the previous street to end at a chance node");
  }
  return {
    kind: "combos",
    board: [...prevStage.board, ...cards],
    heroRange: narrowRangeAlongPath(prevStage.state.result.heroRange, "P1", prevStage.path),
    villainRange: narrowRangeAlongPath(prevStage.state.result.villainRange, "P2", prevStage.path),
    startPot: terminal.potBb,
    effectiveStackBb: prevStage.effectiveStackAtStart - terminal.committed.P1,
    ...solveOptions,
  };
}

/** Pot entering street `i` — the previous street's closing pot, or the preflop pot for the flop. */
export function streetStartPot(streets: StreetStage[], i: number, preflopPot: number): number {
  return i === 0 ? preflopPot : (streets[i - 1].currentNode?.potBb ?? preflopPot);
}

export function pickDifferentLabel(stage: StreetStage): string {
  return stage.streetLabel === "Flop" ? "Pick a different board" : `Pick a different ${stage.streetLabel.toLowerCase()} card`;
}
