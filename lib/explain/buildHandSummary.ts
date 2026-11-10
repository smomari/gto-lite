import { actionPathKey, aggressiveFrequencies } from "@/lib/solveEngine/postflopHandoff";
import { narrowRangeAlongPath, type TreePathStep } from "@/lib/postflopSolver/rangeNarrowing";
import { streetForBoardLength } from "@/lib/postflopSolver/betAbstraction";
import { RANKS } from "@/lib/cards";
import type { GameFormatId } from "@/lib/solveEngine/gameFormat";
import type { IcmId } from "@/lib/solveEngine/icm";
import type { RakeId } from "@/lib/solveEngine/rake";
import type { ActionNode, HandFrequency, Position } from "@/types/rangeData";
import type { SolveResponse } from "@/types/solveApi";
import type { PostflopResultMessage, SerializedCombo, SerializedTerminalNode } from "@/types/postflopSolver";
import { STRENGTH_BUCKETS, strengthBuckets, type StrengthBucket } from "./handStrength";
import {
  PREFLOP_GROUPS,
  type HandSummary,
  type PostflopDecisionSummary,
  type PreflopDecisionSummary,
  type PreflopGroup,
  type StreetSummary,
} from "./summarySchema";

/** What the result screen can't see itself: the table settings, the seats, and the preflop line. */
export type ExplainContext = Pick<HandSummaryInput, "game" | "oop" | "ip" | "preflop">;

/** One finished street: what its solve returned and the line played through it. */
export interface ExplainStreetInput {
  board: string[];
  effectiveStackAtStart: number;
  result: PostflopResultMessage;
  path: TreePathStep[];
}

export interface HandSummaryInput {
  game: { format: GameFormatId; stackBb: number; rake: RakeId; icm: IcmId };
  /** P1 (acts first postflop) and P2. */
  oop: Position;
  ip: Position;
  preflop: {
    actionPath: ActionNode[];
    /** Responses seen at this table, keyed by actionPathKey of the path before each decision. */
    responses: Record<string, SolveResponse>;
    potBb: number;
  };
  /** From the flop to the street the hand ended on. */
  streets: ExplainStreetInput[];
  ending: { node: SerializedTerminalNode; allIn: boolean; rakeBb: number };
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

function percentOf(part: number, total: number): number {
  return total > 0 ? round1((100 * part) / total) : 0;
}

const SUITED_CONNECTOR_TOP_RANK_INDEX = RANKS.indexOf("T");
const BROADWAY_MAX_RANK_INDEX = RANKS.indexOf("T");

function comboCount(hand: string): number {
  return hand.length === 2 ? 6 : hand.endsWith("s") ? 4 : 12;
}

export function preflopGroupOf(hand: string): PreflopGroup {
  if (hand.length === 2) return "pairs";
  const high = RANKS.indexOf(hand[0] as (typeof RANKS)[number]);
  const low = RANKS.indexOf(hand[1] as (typeof RANKS)[number]);
  const broadway = low <= BROADWAY_MAX_RANK_INDEX;
  if (hand.endsWith("s")) {
    if (high === 0) return "suited-aces";
    if (broadway) return "suited-broadway";
    if (low - high === 1 && high >= SUITED_CONNECTOR_TOP_RANK_INDEX) return "suited-connectors";
    return "other-suited";
  }
  return broadway ? "offsuit-broadway" : "other-offsuit";
}

/** How often `hand` took `action` at its decision, the way the postflop hand-off reads it. */
function takenFrequency(hands: HandFrequency[], action: ActionNode["action"]): number[] {
  if (action === "raise" || action === "allin") return aggressiveFrequencies(hands);
  return hands.map((hf) => hf[action]);
}

type PreflopMix = { fold: number; call: number; raise: number; allin: number };

function preflopMix(entries: { hf: HandFrequency; weight: number }[]): { combos: number } & PreflopMix {
  let combos = 0;
  const sums = { fold: 0, call: 0, raise: 0, allin: 0 };
  for (const { hf, weight } of entries) {
    combos += weight;
    sums.fold += weight * hf.fold;
    sums.call += weight * hf.call;
    sums.raise += weight * hf.raise;
    sums.allin += weight * (hf.allin ?? 0);
  }
  return {
    combos: round1(combos),
    fold: percentOf(sums.fold, combos),
    call: percentOf(sums.call, combos),
    raise: percentOf(sums.raise, combos),
    allin: percentOf(sums.allin, combos),
  };
}

/**
 * Each preflop decision in order. The two seats that saw the flop also get
 * their chart at that decision, weighted by how often each hand got there
 * through the seat's earlier actions, overall and by hand group.
 */
function summarizePreflop(input: HandSummaryInput): PreflopDecisionSummary[] {
  const { actionPath, responses } = input.preflop;
  const reach: Partial<Record<Position, Map<string, number>>> = {};

  return actionPath.map((node, i) => {
    const decision: PreflopDecisionSummary = { seat: node.actor, action: node.action, ...(node.sizeBb !== undefined && { sizeBb: round1(node.sizeBb) }) };
    const response = responses[actionPathKey(actionPath.slice(0, i))];
    if ((node.actor !== input.oop && node.actor !== input.ip) || response?.heroPosition !== node.actor) return decision;

    const seatReach = (reach[node.actor] ??= new Map());
    const entries = response.hands.map((hf) => ({ hf, weight: comboCount(hf.hand) * (seatReach.get(hf.hand) ?? 1) }));
    const { combos, ...mix } = preflopMix(entries);
    const groups = PREFLOP_GROUPS.map((group) => ({ group, ...preflopMix(entries.filter((e) => preflopGroupOf(e.hf.hand) === group)) })).filter(
      (g) => g.combos > 0,
    );

    const taken = takenFrequency(response.hands, node.action);
    response.hands.forEach((hf, h) => seatReach.set(hf.hand, (seatReach.get(hf.hand) ?? 1) * taken[h]));
    return { ...decision, source: response.source, combos, mix, groups };
  });
}

const STREET_NAMES = { flop: "Flop", turn: "Turn", river: "River" } as const;

function rangeOf(street: ExplainStreetInput, player: "P1" | "P2"): SerializedCombo[] {
  return player === "P1" ? street.result.heroRange : street.result.villainRange;
}

function totalWeight(range: SerializedCombo[]): number {
  return range.reduce((sum, c) => sum + c.weight, 0);
}

function bucketShares(range: SerializedCombo[], buckets: (StrengthBucket | null)[]): Record<StrengthBucket, number> {
  const total = totalWeight(range);
  const shares = Object.fromEntries(STRENGTH_BUCKETS.map((b) => [b, 0])) as Record<StrengthBucket, number>;
  range.forEach((c, i) => {
    const bucket = buckets[i];
    if (bucket) shares[bucket] += c.weight;
  });
  for (const b of STRENGTH_BUCKETS) shares[b] = percentOf(shares[b], total);
  return shares;
}

/** The actor's range at a decision, its strength against the opponent's range there, and how it plays each bucket. */
function summarizeDecision(street: ExplainStreetInput, stepIndex: number, seats: Record<"P1" | "P2", Position>): PostflopDecisionSummary {
  const step = street.path[stepIndex];
  const { node } = step;
  const before = street.path.slice(0, stepIndex);
  const opponent = node.actor === "P1" ? "P2" : "P1";
  const range = narrowRangeAlongPath(rangeOf(street, node.actor), node.actor, before);
  const actorBuckets = strengthBuckets(street.board, range, narrowRangeAlongPath(rangeOf(street, opponent), opponent, before));

  const mixOf = (indices: number[]) => {
    const weight = indices.reduce((sum, c) => sum + range[c].weight, 0);
    return node.actions.map((_, a) => percentOf(indices.reduce((sum, c) => sum + range[c].weight * (node.strategy[c]?.[a] ?? 0), 0), weight));
  };

  const total = totalWeight(range);
  const all = range.map((_, c) => c);
  const byBucket = STRENGTH_BUCKETS.map((bucket) => {
    const indices = all.filter((c) => actorBuckets[c] === bucket);
    return { bucket, share: percentOf(indices.reduce((sum, c) => sum + range[c].weight, 0), total), mix: mixOf(indices) };
  }).filter((b) => b.share > 0);

  return {
    seat: seats[node.actor],
    potBb: round1(node.potBb),
    toCallBb: round1(node.currentBetToCall),
    options: node.actions.map((a) => a.label),
    taken: node.actions[step.actionIndex].label,
    combos: round1(total),
    mix: mixOf(all),
    byBucket,
  };
}

function summarizeStreet(street: ExplainStreetInput, startPotBb: number, seats: Record<"P1" | "P2", Position>): StreetSummary {
  const { heroRange, villainRange, exploitability } = street.result;
  const buckets = {
    P1: strengthBuckets(street.board, heroRange, villainRange),
    P2: strengthBuckets(street.board, villainRange, heroRange),
  };
  return {
    street: STREET_NAMES[streetForBoardLength(street.board.length)],
    board: street.board,
    startPotBb: round1(startPotBb),
    stackBb: round1(street.effectiveStackAtStart),
    ...(exploitability && { exploitabilityPct: round1(Math.min(100, exploitability.percentOfPot)) }),
    ranges: [
      { seat: seats.P1, combos: round1(totalWeight(heroRange)), buckets: bucketShares(heroRange, buckets.P1) },
      { seat: seats.P2, combos: round1(totalWeight(villainRange)), buckets: bucketShares(villainRange, buckets.P2) },
    ],
    decisions: street.path.map((_, i) => summarizeDecision(street, i, seats)),
  };
}

/** The pot where a street's line ended: the node its last action led to. */
function endPot(street: ExplainStreetInput): number | undefined {
  const last = street.path[street.path.length - 1];
  return last?.node.actions[last.actionIndex].child.potBb;
}

/** The numbers an explanation of this hand may cite, from the first preflop decision to how it ended. */
export function buildHandSummary(input: HandSummaryInput): HandSummary {
  const seats = { P1: input.oop, P2: input.ip };
  const streets = input.streets.map((street, k) =>
    summarizeStreet(street, k === 0 ? input.preflop.potBb : (endPot(input.streets[k - 1]) ?? input.preflop.potBb), seats),
  );

  const { node, allIn, rakeBb } = input.ending;
  const common = { potBb: round1(node.potBb), rakeBb: round1(rakeBb) };
  const equity = node.checkdownEquity;
  const result: HandSummary["result"] =
    node.type === "terminal-fold"
      ? { kind: "fold", winner: seats[node.winner!], ...common }
      : {
          kind: allIn ? "allin" : "showdown",
          ...common,
          ...(equity && {
            equityPct: [
              { seat: input.oop, equity: round1(equity.heroEquityPercent) },
              { seat: input.ip, equity: round1(equity.villainEquityPercent) },
            ],
          }),
        };

  return {
    game: input.game,
    seats: { oop: input.oop, ip: input.ip },
    preflop: { potBb: round1(input.preflop.potBb), decisions: summarizePreflop(input) },
    streets,
    result,
  };
}
