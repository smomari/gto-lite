export const ACTION_COLORS = {
  fold: "#1a1e24",
  call: "#4874ad",
  raise: "#c4692f",
  allin: "#9c3a3a",
} as const;

/** Legend order; their names are `Messages.actionLegend`. */
export const ACTION_KEYS = ["fold", "call", "raise", "allin"] as const satisfies readonly (keyof typeof ACTION_COLORS)[];
