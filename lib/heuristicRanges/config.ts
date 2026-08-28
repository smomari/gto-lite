import type { Position } from "@/types/rangeData";

/** Percentile buffer width (in percentile units, 0..1) for soft threshold cutoffs. */
export const MIX_BUFFER = 0.03;

/** RFI opening threshold by hero position (fraction of hands, by percentile, that open). BB never opens. */
export const RFI_THRESHOLD: Partial<Record<Position, number>> = {
  UTG: 0.13,
  MP: 0.17,
  CO: 0.25,
  BTN: 0.43,
  SB: 0.4,
};

/** The single representative opener position hero faces at a vs-open node. */
export const VS_OPEN_OPENER: Partial<Record<Position, Position>> = {
  MP: "UTG",
  CO: "MP",
  BTN: "CO",
  SB: "BTN",
  BB: "SB",
};

/** Overall continuing (call+raise) threshold at a vs-open node, by hero position. */
export const VS_OPEN_CONTINUE_THRESHOLD: Partial<Record<Position, number>> = {
  MP: 0.12,
  CO: 0.2,
  BTN: 0.35,
  SB: 0.22,
  BB: 0.45,
};

/** Fraction of the vs-open continuing range that 3-bets rather than calls. */
export const VS_OPEN_RAISE_FRACTION = 0.35;

/** The representative 3-bettor position hero (the opener) faces at a vs-3bet node. */
export const VS_3BET_BETTOR: Partial<Record<Position, Position>> = {
  UTG: "BB",
  MP: "BB",
  CO: "BB",
  BTN: "BB",
  SB: "BTN",
};

/** Overall continuing (call+4bet) threshold at a vs-3bet node, by hero (opener) position. */
export const VS_3BET_CONTINUE_THRESHOLD: Partial<Record<Position, number>> = {
  UTG: 0.08,
  MP: 0.1,
  CO: 0.13,
  BTN: 0.18,
  SB: 0.14,
};

/** Fraction of the vs-3bet continuing range that 4-bets rather than flat calls. */
export const VS_3BET_FOURBET_FRACTION = 0.3;

/** BB facing BTN-open + SB-cold-call: overall continuing (call+raise) threshold. */
export const SQUEEZE_CONTINUE_THRESHOLD = 0.3;

/** Squeeze spots are raise-heavy: most of the continuing range re-raises, not calls. */
export const SQUEEZE_RAISE_FRACTION = 0.65;

/**
 * Reduction applied to the starting effective stack to approximate what's left
 * once hero (the 3-bettor) is facing a 4-bet — used to feed the Nash push/fold
 * solver a smaller effective stack for these deep vs-4bet nodes, rather than
 * modeling the exact pot/stack bookkeeping of the preceding raises.
 */
export const VS_4BET_EFFECTIVE_STACK_FACTOR = 0.5;
