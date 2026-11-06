import { bubbleFactor, icmEquity, type IcmField } from "@/lib/icm/malmuthHarville";
import type { PushFoldPayoffs } from "@/lib/nashSolver/pushFoldSolver";

export type IcmId = "chip-ev" | "early" | "near-bubble" | "bubble" | "in-the-money" | "final-table";

/** A stage of one tournament: how many are left and what each place pays. No payouts means chip EV. */
export interface IcmStructure {
  id: IcmId;
  label: string;
  /** What this stage is, for the settings list. */
  stage: string;
  playersLeft: number;
  /** Share of the prize pool by place, from first: only the places still to be paid. */
  payouts: readonly number[];
}

const FIELD_SIZE = 1000;
const PAID_PLACES = 150;
/**
 * Place k pays in proportion to k^-0.9: first takes 14% of the pool and a min
 * cash 1.5 buy-ins, the shape of a common online MTT payout table, generated
 * rather than copied from any one site's.
 */
const PAYOUT_EXPONENT = 0.9;

function powerLawPayouts(places: number, exponent: number): number[] {
  const weights = Array.from({ length: places }, (_, k) => Math.pow(k + 1, -exponent));
  const total = weights.reduce((sum, w) => sum + w, 0);
  return weights.map((w) => w / total);
}

const MTT_PAYOUTS = powerLawPayouts(PAID_PLACES, PAYOUT_EXPONENT);

export const CHIP_EV: IcmStructure = { id: "chip-ev", label: "Chip EV", stage: "", playersLeft: 0, payouts: [] };

export const ICM_PRESETS: IcmStructure[] = [
  CHIP_EV,
  { id: "early", label: "Early", stage: `${400}/${FIELD_SIZE} left`, playersLeft: 400, payouts: MTT_PAYOUTS },
  { id: "near-bubble", label: "Near bubble", stage: `${170} left · ${PAID_PLACES} paid`, playersLeft: 170, payouts: MTT_PAYOUTS },
  { id: "bubble", label: "Bubble", stage: `${PAID_PLACES + 1} left · ${PAID_PLACES} paid`, playersLeft: PAID_PLACES + 1, payouts: MTT_PAYOUTS },
  { id: "in-the-money", label: "In the money", stage: `${140} left`, playersLeft: 140, payouts: MTT_PAYOUTS.slice(0, 140) },
  { id: "final-table", label: "Final table", stage: "8 left", playersLeft: 8, payouts: MTT_PAYOUTS.slice(0, 8) },
];

export function icmById(id: string): IcmStructure | undefined {
  return ICM_PRESETS.find((icm) => icm.id === id);
}

export function isChipEv(icm: IcmStructure): boolean {
  return icm.payouts.length === 0;
}

/**
 * The field as this table sees it: these stacks seated, and everyone else
 * left holding `averageStackBb` — the app has one stack setting, so that is
 * every seat's starting stack too.
 */
export function icmFieldFor(icm: IcmStructure, tableStacks: readonly number[], averageStackBb: number): IcmField {
  return {
    tableStacks,
    offTablePlayers: Math.max(0, icm.playersLeft - tableStacks.length),
    offTableStack: averageStackBb,
    payouts: icm.payouts,
  };
}

/** Each seat's share of the prize pool with these stacks. */
export function seatEquities(icm: IcmStructure, tableStacks: readonly number[], averageStackBb: number): number[] {
  return icmEquity(icmFieldFor(icm, tableStacks, averageStackBb));
}

/**
 * The shover's and the caller's share of the prize pool after each way a
 * shove can end. Both have `remainingBb` behind and `deadMoneyBb` sits in the
 * middle: the folder's blinds go to the other, as if the caller were the BB.
 * The rest of the table and the field keep `stackBb`.
 */
export function pushFoldPayoffs(icm: IcmStructure, seats: number, stackBb: number, remainingBb: number, deadMoneyBb: number): PushFoldPayoffs {
  const others = Array<number>(seats - 2).fill(stackBb);
  const values = (shoverBb: number, callerBb: number) => seatEquities(icm, [shoverBb, callerBb, ...others], stackBb);
  const shoverFolds = values(remainingBb, remainingBb + deadMoneyBb);
  const steal = values(remainingBb + deadMoneyBb, remainingBb);
  const shoverWins = values(2 * remainingBb + deadMoneyBb, 0);
  const callerWins = values(0, 2 * remainingBb + deadMoneyBb);
  return {
    shover: { fold: shoverFolds[0], steal: steal[0], win: shoverWins[0], lose: callerWins[0] },
    caller: { fold: steal[1], win: callerWins[1], lose: shoverWins[1] },
  };
}

/** The bubble factor between two seats of a table where everyone holds `stackBb`, for `riskBb` changing hands. */
export function equalStackBubbleFactor(icm: IcmStructure, seats: number, stackBb: number, riskBb: number): number {
  if (isChipEv(icm)) return 1;
  return bubbleFactor(icmFieldFor(icm, Array(seats).fill(stackBb), stackBb), 0, 1, riskBb);
}
