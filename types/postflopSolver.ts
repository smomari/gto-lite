import type { HandFrequency } from "./rangeData";
import type { PostflopActionType, PostflopPlayer } from "@/lib/postflopSolver/potState";

/** Which of a hand's fold/call/raise/allin frequencies defines a player's range entering the street. */
export type ActionWeightKey = "fold" | "call" | "raise" | "allin";

export interface PostflopSolveRequest {
  board: string[];
  heroHandFrequencies: HandFrequency[];
  heroActionKey: ActionWeightKey;
  villainHandFrequencies: HandFrequency[];
  villainActionKey: ActionWeightKey;
  startPot: number;
  effectiveStackBb: number;
  iterations: number;
}

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
