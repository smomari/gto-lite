import { remainingDeck } from "@/lib/cards";
import {
  BET_SIZING,
  computePostflopAvailableActions,
  streetForBoardLength,
  type PostflopStreet,
  type StreetBetSizing,
} from "./betAbstraction";
import {
  applyPostflopAction,
  initialPostflopPotState,
  otherPlayer,
  totalPot,
  type PostflopActionType,
  type PostflopPlayer,
  type PostflopPotState,
} from "./potState";

export interface DecisionNode {
  type: "decision";
  actor: PostflopPlayer;
  state: PostflopPotState;
  actions: { action: PostflopActionType; child: PostflopTreeNode }[];
}

export interface TerminalFoldNode {
  type: "terminal-fold";
  winner: PostflopPlayer;
  state: PostflopPotState;
}

export interface TerminalShowdownNode {
  type: "terminal-showdown";
  state: PostflopPotState;
}

/**
 * A street change inside a multi-street tree (buildHandTree): one child per
 * card that can come next, weighted by its probability. `state` is the closed
 * street's final pot state; each child street starts fresh from its total pot.
 */
export interface ChanceNode {
  type: "chance";
  state: PostflopPotState;
  children: { card: string; weight: number; child: PostflopTreeNode }[];
  /** The children are a sample standing for the whole deck (not every card), so the engine renormalizes per combo — see engine.cpp's SampledDeal. */
  sampled: boolean;
}

export type PostflopTreeNode = DecisionNode | TerminalFoldNode | TerminalShowdownNode | ChanceNode;

/** For code that only handles one street (the TypeScript engine and its tree walks): multi-street trees need the C++ engine. */
export function singleStreetOnly(where: string): never {
  throw new Error(`${where}: chance nodes (multi-street trees) are only supported by the C++ engine`);
}

/** Next cards to deal after `board`, with their probabilities. */
export type DealNextCards = (board: string[]) => { card: string; weight: number }[];

/**
 * Every remaining card. Given both players' hole cards, each of the
 * 52 − board − 4 cards that can still come is equally likely, so each weighs
 * 1 / (48 − board). The children also include cards a given pair of hands
 * holds — the solver zeroes those combos in that child — which is why the
 * weights deliberately don't sum to 1 over all children.
 */
export const dealEveryCard: DealNextCards = (board) => {
  const weight = 1 / (48 - board.length);
  return remainingDeck(board).map((card) => ({ card, weight }));
};

/** Where a street that closes with stack behind leads; `undefined` ends the tree there with a showdown. */
type StreetClose = (closing: PostflopPotState, stackLeft: number) => PostflopTreeNode | undefined;

/**
 * Builds the full decision tree for one street under Phase A's bet
 * abstraction (betAbstraction.ts): a handful of bet/raise sizes per street,
 * capped at one raise, so the tree stays small and fully enumerable up front
 * rather than needing lazy/streaming construction.
 */
export function buildStreetTree(startPot: number, effectiveStackBb: number, street: PostflopStreet): PostflopTreeNode {
  return buildFrom(initialPostflopPotState(startPot), "P1", effectiveStackBb, street, BET_SIZING[street]);
}

export interface HandTreeOptions {
  /** Which cards come next at each street change, and their weights. Default: every card. */
  dealNextCards?: DealNextCards;
  /** Bet menus for the streets after the first one (e.g. betAbstraction.ts's LOOKAHEAD_BET_SIZING). Default: BET_SIZING. */
  laterStreetSizing?: Record<PostflopStreet, StreetBetSizing>;
  /** The last street to include; one closing before the river past it ends in a showdown (valued by its runout equity). Default: river. */
  lastStreet?: PostflopStreet;
}

/**
 * `board`'s street and every street after it through the river: whenever a
 * street closes with stack behind, a chance node deals `dealNextCards(board)`
 * and the next street's tree hangs under each card. All-ins stay showdown
 * terminals (the remaining cards are in their equity, not in the tree).
 */
export function buildHandTree(
  startPot: number,
  effectiveStackBb: number,
  board: string[],
  options: HandTreeOptions = {},
): PostflopTreeNode {
  return buildStreetsFrom(startPot, effectiveStackBb, board, options, true);
}

function buildStreetsFrom(
  startPot: number,
  effectiveStackBb: number,
  board: string[],
  options: HandTreeOptions,
  isFirstStreet: boolean,
): PostflopTreeNode {
  const street = streetForBoardLength(board.length);
  const sizing = (!isFirstStreet && options.laterStreetSizing?.[street]) || BET_SIZING[street];
  const dealNextCards = options.dealNextCards ?? dealEveryCard;
  const onStreetClose: StreetClose | undefined =
    street === "river" || street === options.lastStreet
      ? undefined
      : (closing, stackLeft) => {
          const dealt = dealNextCards(board);
          return {
            type: "chance",
            state: closing,
            children: dealt.map(({ card, weight }) => ({
              card,
              weight,
              child: buildStreetsFrom(totalPot(closing), stackLeft, [...board, card], options, false),
            })),
            sampled: dealt.length < remainingDeck(board).length,
          };
        };
  return buildFrom(initialPostflopPotState(startPot), "P1", effectiveStackBb, street, sizing, onStreetClose);
}

function buildFrom(
  state: PostflopPotState,
  actor: PostflopPlayer,
  effectiveStackBb: number,
  street: PostflopStreet,
  sizing: StreetBetSizing,
  onStreetClose?: StreetClose,
): PostflopTreeNode {
  /** A closed street: the next street if there's stack behind and one follows, else a showdown. */
  const closeStreet = (next: PostflopPotState): PostflopTreeNode => {
    const stackLeft = effectiveStackBb - next.committed.P1;
    return (stackLeft > 0 ? onStreetClose?.(next, stackLeft) : undefined) ?? { type: "terminal-showdown", state: next };
  };

  const available = computePostflopAvailableActions(state, actor, effectiveStackBb, street, sizing);
  const actions: DecisionNode["actions"] = [];

  if (available.fold) {
    const next = applyPostflopAction(state, actor, "fold", { effectiveStackBb });
    actions.push({ action: "fold", child: { type: "terminal-fold", winner: otherPlayer(actor), state: next } });
  }

  if (available.check) {
    const next = applyPostflopAction(state, actor, "check", { effectiveStackBb });
    // The street's first-ever action never closes it (the other player hasn't
    // acted yet); a check *responding* to the other player's own check does.
    const closesStreet = state.lastActor !== null;
    const child: PostflopTreeNode = closesStreet
      ? closeStreet(next)
      : buildFrom(next, otherPlayer(actor), effectiveStackBb, street, sizing, onStreetClose);
    actions.push({ action: "check", child });
  }

  if (available.call) {
    // Calling always closes the street under this abstraction — no raise
    // survives past RAISE_CAP, so there is never action left after a call.
    const next = applyPostflopAction(state, actor, "call", { effectiveStackBb });
    actions.push({ action: "call", child: closeStreet(next) });
  }

  for (const { toBb } of available.bet) {
    const next = applyPostflopAction(state, actor, "bet", { effectiveStackBb, betToBb: toBb });
    actions.push({ action: "bet", child: buildFrom(next, otherPlayer(actor), effectiveStackBb, street, sizing, onStreetClose) });
  }

  for (const { toBb } of available.raise) {
    const next = applyPostflopAction(state, actor, "raise", { effectiveStackBb, betToBb: toBb });
    actions.push({ action: "raise", child: buildFrom(next, otherPlayer(actor), effectiveStackBb, street, sizing, onStreetClose) });
  }

  if (available.allin) {
    const next = applyPostflopAction(state, actor, "allin", { effectiveStackBb });
    actions.push({ action: "allin", child: buildFrom(next, otherPlayer(actor), effectiveStackBb, street, sizing, onStreetClose) });
  }

  return { type: "decision", actor, state, actions };
}
