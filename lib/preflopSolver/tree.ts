import type { ActionType, Position } from "@/types/rangeData";
import type { AvailableActions } from "@/types/solveApi";
import { postflopSeatIndex } from "@/lib/actionTree/seatOrder";
import { computeAvailableActions } from "@/lib/solveEngine/actionSizing";
import type { GameFormat } from "@/lib/solveEngine/gameFormat";
import { applyAction, initialPotState, type PotState } from "@/lib/solveEngine/potState";
import { netPot, NO_RAKE_SETTINGS, type RakeSettings } from "@/lib/solveEngine/rake";
import { computeNextActor } from "@/lib/solveEngine/rotation";

/** Which of the legal actions a seat gets in this tree. Whatever it leaves out, the seat never does. */
export type ActionRules = (seat: Position, state: PotState, available: AvailableActions) => ActionType[];

export interface TreeOptions {
  format: GameFormat;
  stackBb: number;
  rake?: RakeSettings;
  /** The seats that play, in table order. Everyone before the first folds. */
  seats: Position[];
  rules: ActionRules;
}

export interface DecisionNode {
  kind: "decision";
  /** Index into the tree's seats. */
  player: number;
  state: PotState;
  actions: { action: ActionType; toBb?: number }[];
  children: TreeNode[];
}

export interface TerminalNode {
  kind: "terminal";
  /**
   * `abandoned`: the first seat folded and the hand goes on without it — it gets
   * nothing either way, and nobody's later play is modeled.
   */
  outcome: "uncontested" | "showdown" | "flop" | "abandoned";
  state: PotState;
  /** Chips each seat has put in, by seat index. */
  committed: number[];
  /** What the winner collects, rake taken. */
  pot: number;
  /** Uncontested: the seat that takes the pot. */
  winner?: number;
  /** Showdown or flop: the two seats left, in position first. */
  ip?: number;
  oop?: number;
  /** Flop: stack behind over the pot. */
  spr?: number;
}

export type TreeNode = DecisionNode | TerminalNode;

export interface PreflopTree {
  options: TreeOptions;
  root: TreeNode;
  decisions: DecisionNode[];
  terminals: TerminalNode[];
}

/**
 * The button opens or folds; the SB re-raises or folds (a flat would make the
 * pot three-way); the BB defends once the SB is out and folds to the SB's
 * re-raise. Every pot that sees a flop or a showdown is then heads-up.
 */
export const BLIND_DEFENSE_RULES: ActionRules = (seat, state, available) => {
  if (state.lastAggressor === null) return [available.raise ? "raise" : "allin", "fold"];
  if (seat === "BB" && state.lastAggressor === "SB") return ["fold"];
  const actions: ActionType[] = ["fold"];
  if (available.call && !(seat === "SB" && state.raiseDepth === 1)) actions.push("call");
  if (available.raise) actions.push("raise");
  if (available.allin) actions.push("allin");
  return actions;
};

/** Shove or fold first in, call or fold the shove. */
export const PUSH_FOLD_RULES: ActionRules = (_seat, state) => (state.lastAggressor === null ? ["allin", "fold"] : ["call", "fold"]);

export function buildPreflopTree(options: TreeOptions): PreflopTree {
  const { format, stackBb, seats, rules } = options;
  const rake = options.rake ?? NO_RAKE_SETTINGS;
  const decisions: DecisionNode[] = [];
  const terminals: TerminalNode[] = [];

  let start = initialPotState(format);
  for (let next = computeNextActor(start); next.type === "active" && next.seat !== seats[0]; next = computeNextActor(start)) {
    start = applyAction(start, next.seat, "fold", { effectiveStackBb: stackBb });
  }

  const terminal = (state: PotState, outcome: TerminalNode["outcome"]): TerminalNode => {
    const committed = seats.map((seat) => state.committed[seat] ?? 0);
    const live = seats.map((_, i) => i).filter((i) => !state.foldedSeats.has(seats[i]));
    const node: TerminalNode = { kind: "terminal", outcome, state, committed, pot: state.potBb };
    if (outcome === "uncontested") {
      node.winner = live[0];
      if (!rake.noFlopNoDrop) node.pot = netPot(state.potBb, rake.structure);
    } else if (outcome !== "abandoned") {
      if (live.length !== 2) throw new Error(`expected a heads-up pot, got ${live.length} seats`);
      [node.ip, node.oop] = postflopSeatIndex(seats[live[0]]) > postflopSeatIndex(seats[live[1]]) ? live : [live[1], live[0]];
      node.pot = netPot(state.potBb, rake.structure);
      if (outcome === "flop") node.spr = (stackBb - committed[node.ip]) / state.potBb;
    }
    terminals.push(node);
    return node;
  };

  const expand = (state: PotState): TreeNode => {
    const next = computeNextActor(state);
    if (next.type === "resolved") {
      if (next.reason === "uncontested") return terminal(state, "uncontested");
      const allIn = seats.some((seat) => !state.foldedSeats.has(seat) && (state.committed[seat] ?? 0) >= stackBb);
      return terminal(state, allIn ? "showdown" : "flop");
    }
    if (state.lastAggressor === null && state.foldedSeats.has(seats[0])) return terminal(state, "abandoned");
    const player = seats.indexOf(next.seat);
    if (player === -1) throw new Error(`${next.seat} acts but isn't in the tree`);
    const available = computeAvailableActions(next.seat, state, stackBb);
    const node: DecisionNode = { kind: "decision", player, state, actions: [], children: [] };
    for (const action of rules(next.seat, state, available)) {
      const toBb = action === "raise" ? available.raise?.toBb : action === "allin" ? stackBb : undefined;
      if (action === "raise" && toBb === undefined) throw new Error(`${next.seat} has no raise here`);
      node.actions.push({ action, toBb });
      node.children.push(expand(applyAction(state, next.seat, action, { effectiveStackBb: stackBb, raiseToBb: toBb })));
    }
    if (node.actions.length === 1) return node.children[0];
    decisions.push(node);
    return node;
  };

  return { options, root: expand(start), decisions, terminals };
}

/** The node reached by these actions from the root, or undefined if the tree has no such line. */
export function nodeAt(tree: PreflopTree, path: ActionType[]): TreeNode | undefined {
  let node: TreeNode = tree.root;
  for (const action of path) {
    if (node.kind !== "decision") return undefined;
    const index = node.actions.findIndex((a) => a.action === action);
    if (index === -1) return undefined;
    node = node.children[index];
  }
  return node;
}
