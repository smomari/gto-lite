import type { Position } from "@/types/rangeData";
import {
  CASH_COLD_CALL_BASE,
  CASH_FIRST_IN_WIDTHS,
  CASH_THREE_BET_WIDTH_RATIO,
  COLD_CALL_BASE,
  FIRST_IN_WIDTHS_BY_STACK,
  RAKE_OPEN_SENSITIVITY,
  THREE_BET_WIDTH_RATIO,
} from "@/lib/heuristicRanges/config";
import {
  BB_ANTE_BB,
  CASH_FOUR_BET_MULTIPLIER,
  CASH_OPEN_RAISE_BB,
  CASH_SB_OPEN_RAISE_BB,
  CASH_THREE_BET_BB_MULTIPLIER,
  CASH_THREE_BET_IP_MULTIPLIER,
  CASH_THREE_BET_SB_MULTIPLIER,
  OPEN_RAISE_IP_DEEP_BB,
  OPEN_RAISE_IP_SHALLOW_BB,
  OPEN_RAISE_OOP_DEEP_BB,
  OPEN_RAISE_OOP_SHALLOW_BB,
  REACTIVE_RAISE_IP_MULTIPLIER,
  REACTIVE_RAISE_OOP_MULTIPLIER,
} from "./constants";
import { DEFAULT_RAKE_SETTINGS, rakeShare, type RakeSettings } from "./rake";

export type GameFormatId = "tournament-8" | "cash-6" | "cash-8";

/** Open raise-to (bb) at or below OPEN_RAISE_SCALING_MIN_STACK_BB, and at STACK_MAX_BB. */
export interface OpenSizeRange {
  shallowBb: number;
  deepBb: number;
}

/** Re-raise size as a multiple of the raise it faces, by position against the raiser. */
export interface ReraiseSizes {
  /** Over an open: in position, and from each blind out of position. */
  threeBet: { ip: number; sbOop: number; bbOop: number };
  /** Over a 3-bet or more. */
  fourBetPlus: { ip: number; oop: number };
}

export interface FirstInAnchor {
  stackBb: number;
  /** Raise-or-fold open width of each seat, UTG..SB. */
  widths: readonly number[];
}

/** The rules and range tuning of one kind of game. */
export interface GameFormat {
  id: GameFormatId;
  label: string;
  /** Seats this table doesn't have. They count as folded from the start, so seat indexes keep meaning distance from the button. */
  absentSeats: readonly Position[];
  /** Single ante the BB posts for the table; 0 when there is none. */
  bbAnteBb: number;
  /** Whether the house takes a cut of each pot, as it does in cash games. */
  allowsRake: boolean;
  openSizes: { oop: OpenSizeRange; ip: OpenSizeRange; sb: OpenSizeRange };
  reraiseSizes: ReraiseSizes;
  sbCanLimp: boolean;
  firstInWidths: readonly FirstInAnchor[];
  threeBetWidthRatio: number;
  coldCallBase: number;
}

const TOURNAMENT_IP_OPEN: OpenSizeRange = { shallowBb: OPEN_RAISE_IP_SHALLOW_BB, deepBb: OPEN_RAISE_IP_DEEP_BB };

export const TOURNAMENT_8: GameFormat = {
  id: "tournament-8",
  label: "Tournament 8-max",
  absentSeats: [],
  bbAnteBb: BB_ANTE_BB,
  allowsRake: false,
  openSizes: {
    oop: { shallowBb: OPEN_RAISE_OOP_SHALLOW_BB, deepBb: OPEN_RAISE_OOP_DEEP_BB },
    ip: TOURNAMENT_IP_OPEN,
    sb: TOURNAMENT_IP_OPEN,
  },
  reraiseSizes: {
    threeBet: { ip: REACTIVE_RAISE_IP_MULTIPLIER, sbOop: REACTIVE_RAISE_OOP_MULTIPLIER, bbOop: REACTIVE_RAISE_OOP_MULTIPLIER },
    fourBetPlus: { ip: REACTIVE_RAISE_IP_MULTIPLIER, oop: REACTIVE_RAISE_OOP_MULTIPLIER },
  },
  sbCanLimp: true,
  firstInWidths: FIRST_IN_WIDTHS_BY_STACK,
  threeBetWidthRatio: THREE_BET_WIDTH_RATIO,
  coldCallBase: COLD_CALL_BASE,
};

const CASH_OPEN: OpenSizeRange = { shallowBb: CASH_OPEN_RAISE_BB, deepBb: CASH_OPEN_RAISE_BB };

const CASH_8: GameFormat = {
  id: "cash-8",
  label: "Cash 8-max",
  absentSeats: [],
  bbAnteBb: 0,
  allowsRake: true,
  openSizes: {
    oop: CASH_OPEN,
    ip: CASH_OPEN,
    sb: { shallowBb: CASH_SB_OPEN_RAISE_BB, deepBb: CASH_SB_OPEN_RAISE_BB },
  },
  reraiseSizes: {
    threeBet: { ip: CASH_THREE_BET_IP_MULTIPLIER, sbOop: CASH_THREE_BET_SB_MULTIPLIER, bbOop: CASH_THREE_BET_BB_MULTIPLIER },
    fourBetPlus: { ip: CASH_FOUR_BET_MULTIPLIER, oop: CASH_FOUR_BET_MULTIPLIER },
  },
  sbCanLimp: false,
  firstInWidths: CASH_FIRST_IN_WIDTHS,
  threeBetWidthRatio: CASH_THREE_BET_WIDTH_RATIO,
  coldCallBase: CASH_COLD_CALL_BASE,
};

const CASH_6: GameFormat = { ...CASH_8, id: "cash-6", label: "Cash 6-max", absentSeats: ["UTG", "UTG1"] };

export const GAME_FORMATS: GameFormat[] = [TOURNAMENT_8, CASH_6, CASH_8];

/** A format's open widths under this rake. Formats without rake keep theirs. */
export function firstInWidthsUnder(format: GameFormat, rake: RakeSettings): readonly FirstInAnchor[] {
  if (!format.allowsRake) return format.firstInWidths;
  const drawnAt = rakeShare(DEFAULT_RAKE_SETTINGS.structure);
  const stealCost = rake.noFlopNoDrop ? 0 : rake.structure.rate;
  const factor = (1 - RAKE_OPEN_SENSITIVITY * (rakeShare(rake.structure) - drawnAt)) * (1 - stealCost);
  return format.firstInWidths.map((anchor) => ({ ...anchor, widths: anchor.widths.map((width) => width * factor) }));
}

export function gameFormatById(id: string): GameFormat | undefined {
  return GAME_FORMATS.find((format) => format.id === id);
}
