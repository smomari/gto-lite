import type { Position } from "@/types/rangeData";
import { FIRST_IN_WIDTHS_BY_STACK, COLD_CALL_BASE, THREE_BET_WIDTH_RATIO } from "@/lib/heuristicRanges/config";
import {
  BB_ANTE_BB,
  OPEN_RAISE_IP_DEEP_BB,
  OPEN_RAISE_IP_SHALLOW_BB,
  OPEN_RAISE_OOP_DEEP_BB,
  OPEN_RAISE_OOP_SHALLOW_BB,
} from "./constants";

export type GameFormatId = "tournament-8";

/** Open raise-to (bb) at or below OPEN_RAISE_SCALING_MIN_STACK_BB, and at STACK_MAX_BB. */
export interface OpenSizeRange {
  shallowBb: number;
  deepBb: number;
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
  openSizes: { oop: OpenSizeRange; ip: OpenSizeRange; sb: OpenSizeRange };
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
  openSizes: {
    oop: { shallowBb: OPEN_RAISE_OOP_SHALLOW_BB, deepBb: OPEN_RAISE_OOP_DEEP_BB },
    ip: TOURNAMENT_IP_OPEN,
    sb: TOURNAMENT_IP_OPEN,
  },
  sbCanLimp: true,
  firstInWidths: FIRST_IN_WIDTHS_BY_STACK,
  threeBetWidthRatio: THREE_BET_WIDTH_RATIO,
  coldCallBase: COLD_CALL_BASE,
};

export const GAME_FORMATS: GameFormat[] = [TOURNAMENT_8];

export function gameFormatById(id: string): GameFormat | undefined {
  return GAME_FORMATS.find((format) => format.id === id);
}
