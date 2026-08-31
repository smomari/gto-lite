import type { PostflopActionType } from "@/lib/postflopSolver/potState";

export const POSTFLOP_ACTION_COLORS: Record<PostflopActionType, string> = {
  fold: "#9ca3af",
  check: "#60a5fa",
  call: "#3b82f6",
  bet: "#f97316",
  allin: "#7f1d1d",
};

/** Stacking order for the color bar, most aggressive action on top (mirrors the preflop grid). */
export const POSTFLOP_ACTION_ORDER: PostflopActionType[] = ["allin", "bet", "call", "check", "fold"];
