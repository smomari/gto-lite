import type { Position } from "@/types/rangeData";
import {
  CASH_CALLED_RERAISE_SHARE_CAP,
  CASH_COLD_CALL_BASE,
  CASH_COLD_CALL_OOP_MULTIPLIER,
  CASH_FIRST_IN_WIDTHS,
  CASH_FOUR_BET_BLUFF_SHARE,
  CASH_FOUR_BET_WIDTH_RATIO,
  CASH_NON_BLIND_THREE_BET_WIDTH_RATIO,
  CASH_OVERCALL_FACTOR_IP_CALLER,
  CASH_OVERCALL_FACTOR_OOP_CALLER,
  CASH_RERAISE_KEEP_BASE,
  CASH_CALLER_SQUEEZE_KEEP_FACTOR,
  CASH_SQUEEZE_KEEP_FACTOR,
  CASH_THREE_BET_WIDTH_RATIO,
  COLD_CALL_BASE,
  COLD_CALL_OOP_MULTIPLIER,
  FIRST_IN_WIDTHS_BY_STACK,
  RAISE_VALUE_SHARE,
  RAKE_OPEN_SENSITIVITY,
  RERAISE_KEEP_BASE,
  RERAISE_MAX_SHARE_OF_KEPT,
  THREE_BET_WIDTH_RATIO,
} from "@/lib/heuristicRanges/config";
import {
  BB_ANTE_BB,
  CASH_FOUR_BET_IP_MULTIPLIER,
  CASH_FOUR_BET_OOP_MULTIPLIER,
  CASH_OPEN_RAISE_BB,
  CASH_SB_OPEN_RAISE_BB,
  CASH_SQUEEZE_BLIND_MULTIPLIER,
  CASH_SQUEEZE_PER_CALLER,
  CASH_THREE_BET_BB_MULTIPLIER,
  CASH_THREE_BET_IP_MULTIPLIER,
  CASH_THREE_BET_SB_MULTIPLIER,
  OPEN_RAISE_BTN_DEEP_BB,
  OPEN_RAISE_BTN_SHALLOW_BB,
  OPEN_RAISE_CO_DEEP_BB,
  OPEN_RAISE_CO_SHALLOW_BB,
  OPEN_RAISE_EARLY_DEEP_BB,
  OPEN_RAISE_EARLY_SHALLOW_BB,
  OPEN_RAISE_SB_DEEP_BB,
  OPEN_RAISE_SB_SHALLOW_BB,
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
  /**
   * Over an open that someone called: a blind's multiple of the open with one
   * caller, an in-position seat's added to its plain 3-bet, plus `perCaller`
   * for each further caller. Without it a squeeze is sized like a 3-bet.
   */
  squeeze?: { blind: number; perCaller: number };
}

export interface FirstInAnchor {
  stackBb: number;
  /** Raise-or-fold open width of each seat, UTG..SB. */
  widths: readonly number[];
  /** With limping on offer: all the SB plays, and the part of it that raises. */
  sbPlay?: number;
  sbRaise?: number;
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
  /** By seat: UTG to HJ, CO, BTN, SB. */
  openSizes: { oop: OpenSizeRange; ip: OpenSizeRange; btn: OpenSizeRange; sb: OpenSizeRange };
  reraiseSizes: ReraiseSizes;
  sbCanLimp: boolean;
  firstInWidths: readonly FirstInAnchor[];
  threeBetWidthRatio: number;
  /** 3-bet width of a seat that isn't a blind. */
  nonBlindThreeBetWidthRatio: number;
  coldCallBase: number;
  coldCallOopMultiplier: number;
  /** Flats facing an open someone already called, per caller: in position on hero, and not. */
  overcallFactor: { ipCaller: number; oopCaller: number };
  /** Facing a squeeze, the share kept of what's kept against a plain 3-bet: by the opener, and by a seat that called it. */
  squeezeKeepFactor: { opener: number; caller: number };
  /** A seat whose last action was a call re-raises at most this share of what it keeps. */
  calledReraiseShareCap: number;
  /** Facing a re-raise with a range of its own, the share of it kept before price and equity move it. */
  reraiseKeepBase: number;
  /** Re-raising a re-raise: a share of the raiser's range, part value and part bluff. */
  fourBet: { widthRatio: number; valueShare: number; bluffShare: number };
}


export const TOURNAMENT_8: GameFormat = {
  id: "tournament-8",
  label: "Tournament 8-max",
  absentSeats: [],
  bbAnteBb: BB_ANTE_BB,
  allowsRake: false,
  openSizes: {
    oop: { shallowBb: OPEN_RAISE_EARLY_SHALLOW_BB, deepBb: OPEN_RAISE_EARLY_DEEP_BB },
    ip: { shallowBb: OPEN_RAISE_CO_SHALLOW_BB, deepBb: OPEN_RAISE_CO_DEEP_BB },
    btn: { shallowBb: OPEN_RAISE_BTN_SHALLOW_BB, deepBb: OPEN_RAISE_BTN_DEEP_BB },
    sb: { shallowBb: OPEN_RAISE_SB_SHALLOW_BB, deepBb: OPEN_RAISE_SB_DEEP_BB },
  },
  reraiseSizes: {
    threeBet: { ip: REACTIVE_RAISE_IP_MULTIPLIER, sbOop: REACTIVE_RAISE_OOP_MULTIPLIER, bbOop: REACTIVE_RAISE_OOP_MULTIPLIER },
    fourBetPlus: { ip: REACTIVE_RAISE_IP_MULTIPLIER, oop: REACTIVE_RAISE_OOP_MULTIPLIER },
  },
  sbCanLimp: true,
  firstInWidths: FIRST_IN_WIDTHS_BY_STACK,
  threeBetWidthRatio: THREE_BET_WIDTH_RATIO,
  nonBlindThreeBetWidthRatio: THREE_BET_WIDTH_RATIO,
  coldCallBase: COLD_CALL_BASE,
  coldCallOopMultiplier: COLD_CALL_OOP_MULTIPLIER,
  overcallFactor: { ipCaller: 1, oopCaller: 1 },
  squeezeKeepFactor: { opener: 1, caller: 1 },
  calledReraiseShareCap: RERAISE_MAX_SHARE_OF_KEPT,
  reraiseKeepBase: RERAISE_KEEP_BASE,
  fourBet: { widthRatio: THREE_BET_WIDTH_RATIO, valueShare: RAISE_VALUE_SHARE, bluffShare: 0 },
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
    btn: CASH_OPEN,
    sb: { shallowBb: CASH_SB_OPEN_RAISE_BB, deepBb: CASH_SB_OPEN_RAISE_BB },
  },
  reraiseSizes: {
    threeBet: { ip: CASH_THREE_BET_IP_MULTIPLIER, sbOop: CASH_THREE_BET_SB_MULTIPLIER, bbOop: CASH_THREE_BET_BB_MULTIPLIER },
    fourBetPlus: { ip: CASH_FOUR_BET_IP_MULTIPLIER, oop: CASH_FOUR_BET_OOP_MULTIPLIER },
    squeeze: { blind: CASH_SQUEEZE_BLIND_MULTIPLIER, perCaller: CASH_SQUEEZE_PER_CALLER },
  },
  sbCanLimp: true,
  firstInWidths: CASH_FIRST_IN_WIDTHS,
  threeBetWidthRatio: CASH_THREE_BET_WIDTH_RATIO,
  nonBlindThreeBetWidthRatio: CASH_NON_BLIND_THREE_BET_WIDTH_RATIO,
  coldCallBase: CASH_COLD_CALL_BASE,
  coldCallOopMultiplier: CASH_COLD_CALL_OOP_MULTIPLIER,
  overcallFactor: { ipCaller: CASH_OVERCALL_FACTOR_IP_CALLER, oopCaller: CASH_OVERCALL_FACTOR_OOP_CALLER },
  squeezeKeepFactor: { opener: CASH_SQUEEZE_KEEP_FACTOR, caller: CASH_CALLER_SQUEEZE_KEEP_FACTOR },
  calledReraiseShareCap: CASH_CALLED_RERAISE_SHARE_CAP,
  reraiseKeepBase: CASH_RERAISE_KEEP_BASE,
  fourBet: { widthRatio: CASH_FOUR_BET_WIDTH_RATIO, valueShare: RAISE_VALUE_SHARE, bluffShare: CASH_FOUR_BET_BLUFF_SHARE },
};

const CASH_6: GameFormat = { ...CASH_8, id: "cash-6", label: "Cash 6-max", absentSeats: ["UTG", "UTG1"] };

export const GAME_FORMATS: GameFormat[] = [TOURNAMENT_8, CASH_6, CASH_8];

/** A format's open widths under this rake. Formats without rake keep theirs. */
export function firstInWidthsUnder(format: GameFormat, rake: RakeSettings): readonly FirstInAnchor[] {
  if (!format.allowsRake) return format.firstInWidths;
  const drawnAt = rakeShare(DEFAULT_RAKE_SETTINGS.structure);
  const stealCost = rake.noFlopNoDrop ? 0 : rake.structure.rate;
  const factor = (1 - RAKE_OPEN_SENSITIVITY * (rakeShare(rake.structure) - drawnAt)) * (1 - stealCost);
  const scale = (width: number | undefined) => (width === undefined ? undefined : width * factor);
  return format.firstInWidths.map((anchor) => ({
    ...anchor,
    widths: anchor.widths.map((width) => width * factor),
    sbPlay: scale(anchor.sbPlay),
    sbRaise: scale(anchor.sbRaise),
  }));
}

export function gameFormatById(id: string): GameFormat | undefined {
  return GAME_FORMATS.find((format) => format.id === id);
}
