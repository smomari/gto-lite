import type { PostflopActionType } from "@/lib/postflopSolver/potState";
import type { SerializedDecisionAction } from "@/types/postflopSolver";

export const POSTFLOP_ACTION_COLORS: Record<PostflopActionType, string> = {
  fold: "#9ca3af",
  check: "#60a5fa",
  call: "#3b82f6",
  bet: "#f97316",
  raise: "#dc2626",
  allin: "#7f1d1d",
};

/** Stacking order for the color bar, most aggressive action on top (mirrors the preflop grid). */
export const POSTFLOP_ACTION_ORDER: PostflopActionType[] = ["allin", "raise", "bet", "call", "check", "fold"];

/**
 * Light -> dark ramps sampled by bet-size / raise-size position within a
 * node's own bet/raise instances (smallest first — `betAbstraction.ts`'s
 * pot-fraction arrays are ascending and `treeBuilder.ts` pushes them in that
 * order, so array position already IS size order). Bet and raise use
 * different hue families so a bet size is never confusable with a raise
 * size, on top of adjacent same-type sizes being visually distinct from
 * each other (the original bug: every bet size shared one fixed orange).
 */
export const BET_COLOR_RAMP = ["#fde68a", "#fbbf24", "#f97316", "#ea580c", "#9a3412"];
export const RAISE_COLOR_RAMP = ["#fca5a5", "#f87171", "#ef4444", "#dc2626", "#991b1b"];

function sampleRamp(ramp: string[], position: number, total: number): string {
  if (total <= 1) return ramp[Math.floor(ramp.length / 2)];
  const t = position / (total - 1);
  return ramp[Math.round(t * (ramp.length - 1))];
}

/**
 * One color per action INSTANCE, index-aligned to `actions` — unlike
 * `POSTFLOP_ACTION_COLORS` (keyed by action TYPE), this gives each distinct
 * bet/raise size its own color instead of collapsing them all to one.
 */
export function buildActionColorScale(actions: SerializedDecisionAction[]): string[] {
  const betIndexes = actions.flatMap((a, i) => (a.action === "bet" ? [i] : []));
  const raiseIndexes = actions.flatMap((a, i) => (a.action === "raise" ? [i] : []));

  return actions.map((a, i) => {
    switch (a.action) {
      case "bet":
        return sampleRamp(BET_COLOR_RAMP, betIndexes.indexOf(i), betIndexes.length);
      case "raise":
        return sampleRamp(RAISE_COLOR_RAMP, raiseIndexes.indexOf(i), raiseIndexes.length);
      default:
        return POSTFLOP_ACTION_COLORS[a.action];
    }
  });
}

/** Picks readable button text color (near-black or near-white) against a hex swatch background. */
export function readableTextColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#111827" : "#f9fafb";
}
