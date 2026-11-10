import type { HandSummary } from "./summarySchema";
import type { ExplainStore } from "./usage";

/** An in-memory ExplainStore for tests and local scripts. Expiry is recorded, not enforced. */
export function memoryStore(): ExplainStore & { values: Map<string, unknown>; ttls: Map<string, number> } {
  const values = new Map<string, unknown>();
  const ttls = new Map<string, number>();
  const add = (key: string, by: number) => {
    const next = Number(values.get(key) ?? 0) + by;
    values.set(key, next);
    return next;
  };
  return {
    values,
    ttls,
    incr: async (key) => add(key, 1),
    decr: async (key) => add(key, -1),
    expire: async (key, seconds) => ttls.set(key, seconds),
    get: async <T,>(key: string) => (values.has(key) ? (values.get(key) as T) : null),
    set: async (key, value, { ex }) => {
      values.set(key, value);
      ttls.set(key, ex);
    },
  };
}

/** A small summary that passes handSummarySchema. */
export const SAMPLE_SUMMARY: HandSummary = {
  game: { format: "tournament-8", stackBb: 100, rake: "none", icm: "chip-ev" },
  seats: { oop: "BB", ip: "BTN" },
  preflop: {
    potBb: 6,
    decisions: [
      { seat: "BTN", action: "raise", sizeBb: 2.5, source: "heuristic-approx", combos: 1326, mix: { fold: 58, call: 0, raise: 42, allin: 0 } },
      { seat: "SB", action: "fold" },
      { seat: "BB", action: "call", source: "heuristic-approx", combos: 1326, mix: { fold: 40, call: 50, raise: 10, allin: 0 } },
    ],
  },
  streets: [
    {
      street: "Flop",
      board: ["Kh", "7s", "2d"],
      startPotBb: 6,
      stackBb: 97.5,
      exploitabilityPct: 0.4,
      ranges: [
        { seat: "BB", combos: 700, buckets: { nuts: 5, strong: 13, medium: 28, draw: 0, air: 54 } },
        { seat: "BTN", combos: 640, buckets: { nuts: 15, strong: 23, medium: 33, draw: 0, air: 29 } },
      ],
      decisions: [
        {
          seat: "BB",
          potBb: 6,
          toCallBb: 0,
          options: ["Check", "Bet 3.3bb"],
          taken: "Check",
          combos: 700,
          mix: [93, 7],
          byBucket: [{ bucket: "air", share: 54, mix: [95, 5] }],
        },
      ],
    },
  ],
  result: { kind: "showdown", potBb: 6, rakeBb: 0 },
};
