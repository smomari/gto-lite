export const SMALL_BLIND_BB = 0.5;
export const BIG_BLIND_BB = 1;
/** Single BB-posted ante covering the whole table (the modern MTT convention). */
export const BB_ANTE_BB = 1;

/** At 1bb an all-in only matches the big blind: no raise, so no seat could ever call it or close the action. */
export const STACK_MIN_BB = 2;
export const STACK_MAX_BB = 100;

/** Always route to the Nash push/fold solver at or under this effective stack. */
export const NASH_FLAT_STACK_THRESHOLD_BB = 15;
/** Route to Nash when facing a raise and remaining-stack/pot is at or under this ratio. */
export const NASH_SPR_THRESHOLD = 1;

/**
 * Opening raise-to size (bb) scales linearly with effective stack depth:
 * flat at/below OPEN_RAISE_SCALING_MIN_STACK_BB, reaching its deepest
 * calibrated value at STACK_MAX_BB (the app's max supported depth). OOP
 * opens 0.3bb bigger than IP at every depth (worse position, a roughly
 * depth-independent penalty) — UTG, UTG1, LJ, HJ vs CO, BTN, SB.
 */
export const OPEN_RAISE_SCALING_MIN_STACK_BB = 40;
export const OPEN_RAISE_IP_SHALLOW_BB = 2.0; // CO, BTN, SB at/below the scaling threshold
export const OPEN_RAISE_IP_DEEP_BB = 2.5; // CO, BTN, SB at STACK_MAX_BB
export const OPEN_RAISE_OOP_SHALLOW_BB = 2.3; // UTG, UTG1, LJ, HJ at/below the scaling threshold
export const OPEN_RAISE_OOP_DEEP_BB = 2.8; // UTG, UTG1, LJ, HJ at STACK_MAX_BB

/** Cash opens one size from every seat, a little bigger from the SB, which plays the pot out of position. */
export const CASH_OPEN_RAISE_BB = 2.5;
export const CASH_SB_OPEN_RAISE_BB = 3;

/** BB's raise-to size over a limp. */
export const LIMP_RAISE_TO_BB = 3.5;

/** Reactive raise-to size, as a multiple of the previous aggressor's raise-to amount. */
export const REACTIVE_RAISE_IP_MULTIPLIER = 3; // raiser acts after the last aggressor postflop
export const REACTIVE_RAISE_OOP_MULTIPLIER = 4; // raiser acts before the last aggressor postflop
