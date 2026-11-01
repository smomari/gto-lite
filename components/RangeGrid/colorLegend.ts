export const ACTION_COLORS = {
  fold: "#1a1e24",
  call: "#4874ad",
  raise: "#c4692f",
  allin: "#9c3a3a",
} as const;

export const ACTION_LABELS: Record<keyof typeof ACTION_COLORS, string> = {
  fold: "Fold",
  call: "Call",
  raise: "Raise",
  allin: "All-in",
};
