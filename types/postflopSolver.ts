import type { HandFrequency } from "./rangeData";
import type { PostflopActionType, PostflopPlayer } from "@/lib/postflopSolver/potState";
import type { ExploitabilityResult } from "@/lib/postflopSolver/exploitability";
import type { CheckdownEquitySummary } from "@/lib/postflopSolver/checkdownEquity";

export type { CheckdownEquitySummary };

export type PostflopSolvePhase = "equity" | "cfr";

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
      maxIterations: number;
      targetExploitabilityPercent?: number;
      /** See PostflopSolveInput's `precise` — a flop-only option, and only flops are canonical requests. */
      precise?: boolean;
    }
  | {
      kind: "combos";
      board: string[];
      heroRange: SerializedCombo[];
      villainRange: SerializedCombo[];
      startPot: number;
      effectiveStackBb: number;
      maxIterations: number;
      targetExploitabilityPercent?: number;
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
  /** Only present for terminal-showdown. The average showdown value if this line is checked down with no further betting — see checkdownEquity.ts. */
  checkdownEquity?: CheckdownEquitySummary;
}

/**
 * Where a street closes with stack behind in a solve that looked ahead to the
 * river (a turn solve). The lookahead below it isn't sent: the next street is
 * re-solved with its full bet menu once its card is picked, like after a
 * terminal-showdown.
 */
export interface SerializedChanceNode {
  type: "chance";
  potBb: number;
  /** Chips each player committed on the street that just closed. */
  committed: { P1: number; P2: number };
  /** The lookahead's average EV over the next card, from the start of the solved street (same frame as checkdown EVs). */
  nextStreetEv?: { heroEvBb: number; villainEvBb: number };
}

export type SerializedTreeNode = SerializedDecisionNode | SerializedTerminalNode | SerializedChanceNode;

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
  phase: PostflopSolvePhase;
  done: number;
  total: number;
  exploitabilityPercent?: number;
}

export interface PostflopErrorMessage {
  type: "error";
  message: string;
}

export type PostflopWorkerOutMessage = PostflopResultMessage | PostflopProgressMessage | PostflopErrorMessage;
