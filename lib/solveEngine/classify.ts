import { NASH_FLAT_STACK_THRESHOLD_BB, NASH_SPR_THRESHOLD } from "./constants";

/**
 * Decides whether a spot reduces to push/fold economics (solve with the real
 * Nash solver) or should fall back to the generalized heuristic engine.
 *
 * Because the pot-state replay tracks the *actual* accumulated pot from prior
 * raises, a deep-stack spot that's seen several raises naturally gets a low
 * stack-to-pot ratio and routes here without any hardcoded per-node-type
 * factor. solve.ts then uses the Nash solver for fresh shoves, and prices
 * anything after more action from the real pot.
 */
export function shouldUseNash(
  effectiveStackBb: number,
  remainingStackBb: number,
  potBb: number,
  hasOpener: boolean,
): boolean {
  if (effectiveStackBb <= NASH_FLAT_STACK_THRESHOLD_BB) return true;
  if (hasOpener && remainingStackBb / potBb <= NASH_SPR_THRESHOLD) return true;
  return false;
}
