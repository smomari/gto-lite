import { z } from "zod";
import { STRENGTH_BUCKETS } from "./handStrength";

/**
 * What the client sends to /api/explain: a hand's solved numbers, small
 * enough for one prompt. Every string is an enum or matches a fixed pattern,
 * so no free text from the client reaches the model.
 */

const percent = z.number().min(0).max(100);
const bb = z.number().min(0).max(100_000);
const card = z.string().regex(/^[2-9TJQKA][shdc]$/);
const position = z.enum(["UTG", "UTG1", "LJ", "HJ", "CO", "BTN", "SB", "BB"]);
/** The labels serialize.ts gives postflop actions, e.g. "Check", "Bet 3.3bb", "Raise to 12.0bb". */
const postflopLabel = z.string().regex(/^(Fold|Check|Call|(Bet|Raise to|Allin) \d{1,6}\.\d+bb)$/);

export const PREFLOP_GROUPS = [
  "pairs",
  "suited-aces",
  "suited-broadway",
  "suited-connectors",
  "other-suited",
  "offsuit-broadway",
  "other-offsuit",
] as const;
export type PreflopGroup = (typeof PREFLOP_GROUPS)[number];

const preflopMix = { fold: percent, call: percent, raise: percent, allin: percent };

const preflopDecision = z.strictObject({
  seat: position,
  action: z.enum(["fold", "call", "raise", "allin"]),
  sizeBb: bb.optional(),
  /** Only on the two seats that saw the flop, when their chart at this decision was loaded. */
  source: z.enum(["nash-shove-fold", "heuristic-approx"]).optional(),
  /** Combos reaching this decision. */
  combos: bb.optional(),
  mix: z.strictObject(preflopMix).optional(),
  groups: z.array(z.strictObject({ group: z.enum(PREFLOP_GROUPS), combos: bb, ...preflopMix })).max(PREFLOP_GROUPS.length).optional(),
});

const bucketShares = z.strictObject(Object.fromEntries(STRENGTH_BUCKETS.map((b) => [b, percent])) as Record<(typeof STRENGTH_BUCKETS)[number], typeof percent>);

const postflopDecision = z
  .strictObject({
    seat: position,
    potBb: bb,
    toCallBb: bb,
    options: z.array(postflopLabel).min(1).max(8),
    taken: postflopLabel,
    /** Combos reaching this decision. */
    combos: bb,
    /** The whole range's frequency of each option, aligned to `options`. */
    mix: z.array(percent).max(8),
    byBucket: z
      .array(z.strictObject({ bucket: z.enum(STRENGTH_BUCKETS), share: percent, mix: z.array(percent).max(8) }))
      .max(STRENGTH_BUCKETS.length),
  })
  .refine((d) => d.options.includes(d.taken) && d.mix.length === d.options.length && d.byBucket.every((b) => b.mix.length === d.options.length));

const street = z.strictObject({
  street: z.enum(["Flop", "Turn", "River"]),
  board: z.array(card).min(3).max(5),
  startPotBb: bb,
  stackBb: bb,
  exploitabilityPct: percent.optional(),
  /** Both ranges entering the street: how many combos, and how they split across strength buckets against each other. */
  ranges: z.array(z.strictObject({ seat: position, combos: bb, buckets: bucketShares })).length(2),
  decisions: z.array(postflopDecision).max(12),
});

const result = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("fold"), winner: position, potBb: bb, rakeBb: bb }),
  z.strictObject({
    kind: z.enum(["showdown", "allin"]),
    potBb: bb,
    rakeBb: bb,
    /** Each seat's average equity over the ranges reaching showdown. */
    equityPct: z.array(z.strictObject({ seat: position, equity: percent })).length(2).optional(),
  }),
]);

export const handSummarySchema = z.strictObject({
  game: z.strictObject({
    format: z.enum(["tournament-8", "cash-6", "cash-8"]),
    stackBb: bb,
    rake: z.enum(["none", "online-high", "online-mid", "online-std", "online-low", "live"]),
    icm: z.enum(["chip-ev", "early", "near-bubble", "bubble", "in-the-money", "final-table"]),
  }),
  /** OOP acts first postflop. */
  seats: z.strictObject({ oop: position, ip: position }),
  preflop: z.strictObject({ potBb: bb, decisions: z.array(preflopDecision).max(24) }),
  streets: z.array(street).min(1).max(3),
  result,
});

export type HandSummary = z.infer<typeof handSummarySchema>;
export type PreflopDecisionSummary = z.infer<typeof preflopDecision>;
export type StreetSummary = z.infer<typeof street>;
export type PostflopDecisionSummary = z.infer<typeof postflopDecision>;
