import type { CanonicalHand } from "@/lib/handRange/handList";

export type Suit = "s" | "h" | "d" | "c";
export const SUITS: Suit[] = ["s", "h", "d", "c"];

type UsedSuits = Map<string, Set<Suit>>;

function used(map: UsedSuits, rank: string): Set<Suit> {
  let set = map.get(rank);
  if (!set) {
    set = new Set();
    map.set(rank, set);
  }
  return set;
}

/**
 * Picks two concrete card strings (e.g. "Ah", "Kd") for a canonical hand,
 * avoiding any rank+suit combination already marked used (so a second hand
 * allocated against the same `usedSuits` map never collides with the first).
 */
function allocate(hand: CanonicalHand, usedSuits: UsedSuits): [string, string] {
  if (hand.type === "pair") {
    const free = SUITS.filter((s) => !used(usedSuits, hand.rankHigh).has(s));
    if (free.length < 2) {
      throw new Error(`Not enough free suits to deal pair ${hand.hand}`);
    }
    const [s1, s2] = free;
    used(usedSuits, hand.rankHigh).add(s1).add(s2);
    return [`${hand.rankHigh}${s1}`, `${hand.rankHigh}${s2}`];
  }

  if (hand.type === "suited") {
    const common = SUITS.find(
      (s) => !used(usedSuits, hand.rankHigh).has(s) && !used(usedSuits, hand.rankLow).has(s),
    );
    if (!common) {
      throw new Error(`Not enough free suits to deal suited hand ${hand.hand}`);
    }
    used(usedSuits, hand.rankHigh).add(common);
    used(usedSuits, hand.rankLow).add(common);
    return [`${hand.rankHigh}${common}`, `${hand.rankLow}${common}`];
  }

  // offsuit
  const freeHigh = SUITS.filter((s) => !used(usedSuits, hand.rankHigh).has(s));
  const freeLow = SUITS.filter((s) => !used(usedSuits, hand.rankLow).has(s));
  for (const s1 of freeHigh) {
    for (const s2 of freeLow) {
      if (s1 !== s2) {
        used(usedSuits, hand.rankHigh).add(s1);
        used(usedSuits, hand.rankLow).add(s2);
        return [`${hand.rankHigh}${s1}`, `${hand.rankLow}${s2}`];
      }
    }
  }
  throw new Error(`Not enough free suits to deal offsuit hand ${hand.hand}`);
}

/**
 * Deals concrete, non-colliding hole cards for two canonical hands so they can
 * be run through a Monte Carlo hand evaluator. Order matters: `handA` is
 * allocated first, so `handB` yields to it on any shared rank.
 */
export function dealTwoHands(
  handA: CanonicalHand,
  handB: CanonicalHand,
): { cardsA: [string, string]; cardsB: [string, string] } {
  const usedSuits: UsedSuits = new Map();
  const cardsA = allocate(handA, usedSuits);
  const cardsB = allocate(handB, usedSuits);
  return { cardsA, cardsB };
}
