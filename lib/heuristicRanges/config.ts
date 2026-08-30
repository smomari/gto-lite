/** Percentile buffer width (in percentile units, 0..1) for soft threshold cutoffs. */
export const MIX_BUFFER = 0.03;

// --- Opening threshold curve ---------------------------------------------
// Percentile (by equity-vs-random) that opens, interpolated linearly across
// seat index 0(UTG)..5(BTN). SB (index 6) is handled as a discount off BTN's
// value rather than continuing the linear ramp, since SB is a blind and
// conventionally opens tighter than BTN despite sitting "later" in raw seat
// order. BB (index 7) never opens (nothing to solve — see rotation.ts).
export const OPEN_THRESHOLD_MIN = 0.12; // UTG
export const OPEN_THRESHOLD_MAX = 0.45; // BTN
export const SB_OPEN_DISCOUNT = 0.9;

// --- Facing-a-raise continuing threshold ----------------------------------
export const BASE_CONTINUE_THRESHOLD = 0.3; // neutral vs-single-raise continue %, before adjustment
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
