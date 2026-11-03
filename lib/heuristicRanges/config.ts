/** Percentile buffer width (in percentile units, 0..1) for soft threshold cutoffs. */
export const MIX_BUFFER = 0.03;

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
/**
 * Cash opens at 100bb, UTG..SB, flat at every stack. The SB limps some and
 * raises some, as GTO Wizard's 6max NL10 does (raise 34%, limp 15%), so its
 * raise-or-fold width is its raising part. 6-max shares this table:
 * its LJ has the same seats behind it as an 8-max LJ folded to. A starting
 * point between conflicting public charts, its button set to GTO Wizard's
 * 6max NL10 (40%), not a solved result.
 */
export const CASH_FIRST_IN_WIDTHS = [{ stackBb: 100, widths: [0.12, 0.14, 0.17, 0.21, 0.28, 0.4, 0.34], sbPlay: 0.49, sbRaise: 0.34 }];
/**
 * How much rake moves the charts. Rake is not in these tables' equity ranking,
 * so these are rules of thumb, not solved results: `rakeShare` is the cut of a
 * typical pot, opens scale away from the share the cash table was drawn at
 * (DEFAULT_RAKE_SETTINGS), and flats pay most, being the hands that must see a
 * flop to win. With no flop no drop off, stealing the blinds pays rake too.
 */
export const RAKE_OPEN_SENSITIVITY = 1.5;
/** Flats keep exp(−RAKE_CONTINUE_FALLOFF × rakeShare) of their width: set so the BB defends a button open as GTO Wizard's NL10 does. */
export const RAKE_CONTINUE_FALLOFF = 10.1;
/**
 * Between the push/fold stacks and JAM_MAX_STACK_BB, a share of each first-in
 * raising range jams instead, growing as the stack shrinks and reaching
 * JAM_MAX_SHARE at JAM_MIN_STACK_BB. The top RAISE_KEEP_SHARE of the range
 * always raises: premiums want action, the middle wants the blinds.
 */
export const JAM_MIN_STACK_BB = 16;
export const JAM_MAX_STACK_BB = 25;
export const JAM_MAX_SHARE = 0.4;
export const RAISE_KEEP_SHARE = 0.3;
/**
 * Facing a re-raise, how much of its range a seat keeps. All-in equities bunch
 * tightly, so a hand-by-hand "does this call show a profit" cliff swings from
 * nearly all to nearly none on a point of equity. The range's edge over the
 * price sets a share instead, and playability ranks the hands inside it.
 * Realization is the part of its all-in equity a range wins, by position. All
 * of these are estimates, set against defense frequencies rather than solved.
 */
export const EQUITY_REALIZATION_IP = 0.9;
export const EQUITY_REALIZATION_OOP = 0.75;
export const RERAISE_KEEP_BASE = 0.5;
/** Cash keeps less: GTO Wizard's NL10 button continues 29% of its range against a 13.5bb BB 3-bet, bluffs included. */
export const CASH_RERAISE_KEEP_BASE = 0.27;
export const RERAISE_KEEP_PER_EQUITY = 1.5;
export const RERAISE_KEEP_MIN = 0.15;
export const RERAISE_KEEP_MAX = 0.75;
/** A limper raised over re-raises at most this share of what it keeps, so its narrow range facing a wide raiser still calls. */
export const RERAISE_MAX_SHARE_OF_KEPT = 1 / 3;
/** Share of combos BB raises over a limp. Heavier on value than a 3-bet: there are only so many suited bluffs. */
export const BB_VS_LIMP_VALUE_WIDTH = 0.34;
export const BB_VS_LIMP_BLUFF_WIDTH = 0.12;
/** Share of the BB's continuing range that a cold caller keeps: IP, with two seats behind. */
export const COLD_CALL_BASE = 0.65;
export const COLD_CALL_PER_SEAT_BEHIND = 0.9;
export const COLD_CALL_OOP_MULTIPLIER = 0.6;
/** 3-bet width as a share of the opener's width, and how much of a raise range is value. */
export const THREE_BET_WIDTH_RATIO = 0.3;
/** Without an ante, flats get worse and more of the continuing range 3-bets. */
export const CASH_COLD_CALL_BASE = 0.43;
/** Set with CASH_COLD_CALL_BASE so the button flats a cutoff open 2.4% and the SB a button open 2.7%, as GTO Wizard's NL10 does. */
export const CASH_COLD_CALL_OOP_MULTIPLIER = 0.85;
/** Blinds 3-bet 0.325 of the opener's width in cash; a seat in position 3-bets 0.4 (the button vs a cutoff open: 11.3%). */
export const CASH_THREE_BET_WIDTH_RATIO = 0.325;
export const CASH_NON_BLIND_THREE_BET_WIDTH_RATIO = 0.4;
/**
 * Overcalling behind a caller: each one cuts the flats to this share, harder
 * when the caller is in position on hero (GTO Wizard NL10: the BB overcalls a
 * cutoff open and button call 8.4%, a button open and SB call 20.2%).
 */
export const CASH_OVERCALL_FACTOR_IP_CALLER = 0.27;
export const CASH_OVERCALL_FACTOR_OOP_CALLER = 0.62;
/**
 * Facing a squeeze, cash keeps this share of what it would keep against a
 * plain 3-bet: the opener (a caller still behind it), and the caller itself.
 */
export const CASH_SQUEEZE_KEEP_FACTOR = 0.55;
export const CASH_CALLER_SQUEEZE_KEEP_FACTOR = 0.85;
/** A cold caller facing a squeeze re-raises at most this share of what it keeps (GTO Wizard NL10 button: 3.5 shove, 23.7 call). */
export const CASH_CALLED_RERAISE_SHARE_CAP = 0.15;
export const RAISE_VALUE_SHARE = 0.6;
/** Cash 4-bets: a share of the 3-bettor's range, 40% of it bluffs, from GTO Wizard's NL10 button facing a BB 3-bet (15% of its range). */
export const CASH_FOUR_BET_WIDTH_RATIO = 0.48;
export const CASH_FOUR_BET_BLUFF_SHARE = 0.4;

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
