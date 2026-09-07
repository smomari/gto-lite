import type { HandFrequency } from "./rangeData";
import type { PostflopActionType, PostflopPlayer } from "@/lib/postflopSolver/potState";
import type { ExploitabilityResult } from "@/lib/postflopSolver/exploitability";

/** Which of a hand's fold/call/raise/allin frequencies defines a player's range entering the street. */
export type ActionWeightKey = "fold" | "call" | "raise" | "allin";

export type PostflopSolveRequest =
  | {
      kind: "canonical";
      board: string[];
      heroHandFrequencies: HandFrequency[];
      heroActionKey: ActionWeightKey;
      villainHandFrequencies: HandFrequency[];
      villainActionKey: ActionWeightKey;
      startPot: number;
      effectiveStackBb: number;
      iterations: number;
    }
  | {
      kind: "combos";
      board: string[];
      heroRange: SerializedCombo[];
      villainRange: SerializedCombo[];
      startPot: number;
      effectiveStackBb: number;
      iterations: number;
    };

export interface SerializedCombo {
  cards: [string, string];
  weight: number;
}

export interface SerializedDecisionAction {
  action: PostflopActionType;
  label: string;
  child: SerializedTreeNode;
}

export interface SerializedDecisionNode {
  type: "decision";
  actor: PostflopPlayer;
  potBb: number;
  currentBetToCall: number;
  actions: SerializedDecisionAction[];
  /** [comboIndex][actionIndex], comboIndex aligned to heroRange if actor is P1, else villainRange. */
  strategy: number[][];
}

export interface SerializedTerminalNode {
  type: "terminal-fold" | "terminal-showdown";
  potBb: number;
  /** Only present for terminal-fold. */
  winner?: PostflopPlayer;
  /** Chips each player committed this street — used to derive the next street's effective stack. */
  committed: { P1: number; P2: number };
}

export type SerializedTreeNode = SerializedDecisionNode | SerializedTerminalNode;

export interface PostflopSolveInMessage {
  type: "solve";
  request: PostflopSolveRequest;
}

export interface PostflopResultMessage {
  type: "result";
  tree: SerializedTreeNode;
  heroRange: SerializedCombo[];
  villainRange: SerializedCombo[];
  iterations: number;
  /** Optional so hand-built test fixtures don't need to supply it — a real solve always populates it. */
  exploitability?: ExploitabilityResult;
}

export interface PostflopProgressMessage {
  type: "progress";
  phase: "equity" | "cfr";
  done: number;
  total: number;
}

export interface PostflopErrorMessage {
  type: "error";
  message: string;
}

export type PostflopWorkerOutMessage = PostflopResultMessage | PostflopProgressMessage | PostflopErrorMessage;
