export const SMALL_BLIND_BB = 0.5;
export const BIG_BLIND_BB = 1;
/** Single BB-posted ante covering the whole table (the modern MTT convention). */
export const BB_ANTE_BB = 1;

export const STACK_MIN_BB = 1;
export const STACK_MAX_BB = 100;

/** Always route to the Nash push/fold solver at or under this effective stack. */
export const NASH_FLAT_STACK_THRESHOLD_BB = 25;
/** Route to Nash when facing a raise and remaining-stack/pot is at or under this ratio. */
export const NASH_SPR_THRESHOLD = 1;

/** Opening raise-to size, as a multiple of the big blind. */
export const OPEN_RAISE_OOP_MULTIPLIER = 4; // UTG, UTG1, LJ, HJ
export const OPEN_RAISE_IP_MULTIPLIER = 3; // CO, BTN, SB

/** Reactive raise-to size, as a multiple of the previous aggressor's raise-to amount. */
export const REACTIVE_RAISE_IP_MULTIPLIER = 3; // raiser's seat index > last aggressor's
export const REACTIVE_RAISE_OOP_MULTIPLIER = 4; // raiser's seat index < last aggressor's
