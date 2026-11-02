/** Cash stays unavailable until it has charts of its own: picking it now would show tournament ranges. */
export const GAME_FORMATS = [
  { id: "tournament-8", label: "Tournament 8-max", available: true },
  { id: "cash-6", label: "Cash 6-max", available: false },
  { id: "cash-8", label: "Cash 8-max", available: false },
];

export const ACTIVE_GAME_FORMAT = GAME_FORMATS[0];
