export const ACTION_COLORS = {
  fold: "#9ca3af",
  call: "#3b82f6",
  raise: "#f97316",
  allin: "#7f1d1d",
} as const;

export const ACTION_LABELS: Record<keyof typeof ACTION_COLORS, string> = {
  fold: "Fold",
  call: "Call",
  raise: "Raise",
  allin: "All-in",
};
