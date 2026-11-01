/** Percentile buffer width (in percentile units, 0..1) for soft threshold cutoffs. */
export const MIX_BUFFER = 0.03;

// --- Opening threshold curve ---------------------------------------------
// Percentile (by equity-vs-random) that opens, interpolated linearly across
// seat index 0(UTG)..5(BTN). SB (index 6) is handled as a discount off BTN's
// value rather than continuing the linear ramp, since SB is a blind and
// conventionally opens tighter than BTN despite sitting "later" in raw seat
// order. BB (index 7) never opens (nothing to solve — see rotation.ts).
/**
 * Share of combos played first-in, interpolated between these stacks and flat
 * outside them. `widths` are each seat's raise-or-fold opens (UTG..SB, SB's
 * being what BB defends a raise against); `sbPlay` is all SB plays with
 * limping on offer and `sbRaise` the part of it that raises.
 */
export const FIRST_IN_WIDTHS_BY_STACK = [
  { stackBb: 20, widths: [0.13, 0.15, 0.18, 0.24, 0.33, 0.42, 0.42], sbPlay: 0.85, sbRaise: 0.2 },
  { stackBb: 40, widths: [0.16, 0.18, 0.22, 0.28, 0.36, 0.5, 0.42], sbPlay: 0.82, sbRaise: 0.24 },
  { stackBb: 100, widths: [0.13, 0.15, 0.19, 0.25, 0.32, 0.46, 0.44], sbPlay: 0.85, sbRaise: 0.1 },
];
/** Share of combos BB raises over a limp. Heavier on value than a 3-bet: there are only so many suited bluffs. */
export const BB_VS_LIMP_VALUE_WIDTH = 0.34;
export const BB_VS_LIMP_BLUFF_WIDTH = 0.12;
/** Share of the BB's continuing range that a cold caller keeps: IP, with two seats behind. */
export const COLD_CALL_BASE = 0.65;
export const COLD_CALL_PER_SEAT_BEHIND = 0.9;
export const COLD_CALL_OOP_MULTIPLIER = 0.6;
/** 3-bet width as a share of the opener's width, and how much of a raise range is value. */
export const THREE_BET_WIDTH_RATIO = 0.3;
export const RAISE_VALUE_SHARE = 0.6;

// --- Facing-a-raise continuing threshold ----------------------------------
export const BASE_CONTINUE_THRESHOLD = 0.3; // neutral continue %, before adjustment, facing a re-raise
export const RAISE_DEPTH_TIGHTEN_FACTOR = 0.55; // multiplied in per extra raise depth beyond 1
export const IP_CONTINUE_MULTIPLIER = 1.15;
export const OOP_CONTINUE_MULTIPLIER = 0.85;
export const POT_ODDS_REFERENCE_RATIO = 0.25; // "neutral" amountOwed/(pot+amountOwed)
export const POT_ODDS_MIN_ADJUST = 0.6;
export const POT_ODDS_MAX_ADJUST = 1.8;

// --- Raise/call split within the continuing range -------------------------
export const RAISE_FRACTION_BASE = 0.35;
export const RAISE_FRACTION_IP_BONUS = 0.1;
export const RAISE_FRACTION_DEPTH_PENALTY = 0.05; // per raise depth beyond 1
export const RAISE_FRACTION_MIN = 0.1;
export const RAISE_FRACTION_MAX = 0.9;
