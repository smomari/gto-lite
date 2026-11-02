import { RANKS, remainingDeck } from "@/lib/cards";

/**
 * A stand-in for dealing every remaining card, for lookahead streets: `count`
 * cards, each weighted for the run of similar cards it represents (weights in
 * the same scale as treeBuilder.ts's dealEveryCard, so they sum to the same
 * total). The remaining deck is ordered so similar cards sit together —
 * flush-relevant suits first (more board cards of the suit), then cards that
 * pair the board, then by rank — and split into `count` near-equal runs, one
 * card from the middle of each. A suit that can bring a flush is never left out
 * unless it has fewer cards than a run.
 */
export function stratifiedNextCards(board: string[], count: number): { card: string; weight: number }[] {
  const baseWeight = 1 / (48 - board.length);
  const deck = remainingDeck(board);
  if (count >= deck.length) return deck.map((card) => ({ card, weight: baseWeight }));

  const suitCount = (card: string) => board.filter((b) => b[1] === card[1]).length;
  const pairsBoard = (card: string) => board.some((b) => b[0] === card[0]);
  const rankOrder = (card: string) => RANKS.indexOf(card[0] as (typeof RANKS)[number]);
  const ordered = [...deck].sort(
    (a, b) =>
      suitCount(b) - suitCount(a) ||
      Number(pairsBoard(b)) - Number(pairsBoard(a)) ||
      rankOrder(a) - rankOrder(b) ||
      a[1].localeCompare(b[1]),
  );

  return Array.from({ length: count }, (_, k) => {
    const start = Math.round((k * ordered.length) / count);
    const end = Math.round(((k + 1) * ordered.length) / count);
    return { card: ordered[Math.floor((start + end) / 2)], weight: (end - start) * baseWeight };
  });
}

/**
 * `count` cards chosen for how they play: k-medoids over each card's
 * `features` (how it changes the ranges), each medoid weighted for the cards it
 * stands for. Unlike stratifiedNextCards this sees the ranges, so two cards that
 * look alike can split and ones that don't can merge. Deterministic: the first
 * medoid is the card nearest the others, the rest are farthest-first. Each
 * group's dealt card comes from `representatives`, not always its medoid.
 */
export function clusteredNextCards(
  board: string[],
  count: number,
  features: (card: string) => Float32Array,
): { card: string; weight: number }[] {
  const baseWeight = 1 / (48 - board.length);
  const deck = remainingDeck(board);
  if (count >= deck.length) return deck.map((card) => ({ card, weight: baseWeight }));

  const vectors = deck.map(features);
  const distance = deck.map((_, a) => deck.map((_, b) => {
    let sum = 0;
    for (let i = 0; i < vectors[a].length; i++) {
      const gap = vectors[a][i] - vectors[b][i];
      if (gap === gap) sum += gap * gap; // NaN: a combo holding either card, which sees only one of them
    }
    return sum;
  }));
  const totalTo = (a: number, members: number[]) => members.reduce((sum, b) => sum + distance[a][b], 0);
  const everyCard = deck.map((_, k) => k);

  const medoids = [everyCard.reduce((best, a) => (totalTo(a, everyCard) < totalTo(best, everyCard) ? a : best))];
  while (medoids.length < count) {
    const nearest = (a: number) => Math.min(...medoids.map((m) => distance[a][m]));
    medoids.push(everyCard.filter((a) => !medoids.includes(a)).reduce((best, a) => (nearest(a) > nearest(best) ? a : best)));
  }

  let groups: number[][] = [];
  for (let round = 0; round < 20; round++) {
    groups = medoids.map(() => []);
    for (const a of everyCard) {
      let closest = medoids.indexOf(a); // a medoid stays in its own group, so none comes up empty
      for (let m = 0; closest < 0 && m < medoids.length; m++) {
        if (m === medoids.length - 1 || medoids.every((b) => distance[a][medoids[m]] <= distance[a][b])) closest = m;
      }
      groups[closest].push(a);
    }
    const next = groups.map((members) => members.reduce((best, a) => (totalTo(a, members) < totalTo(best, members) ? a : best)));
    if (next.every((a, m) => a === medoids[m])) break;
    medoids.splice(0, medoids.length, ...next);
  }
  return representatives(deck, groups, medoids).map((m, k) => ({ card: deck[m], weight: groups[k].length * baseWeight }));
}

/**
 * Each group's card, keeping the suits in the deck's proportions: equity barely
 * sees a turn's suit, so the medoids alone can all land on the one suit that
 * brings no flush draw. Biggest groups pick first; a group takes its member of
 * the suit furthest behind its share, its medoid if that's a tie.
 */
function representatives(deck: string[], groups: number[][], medoids: number[]): number[] {
  const suitOf = (index: number) => deck[index][1];
  const inDeck = new Map<string, number>();
  for (const card of deck) inDeck.set(card[1], (inDeck.get(card[1]) ?? 0) + 1);
  const picked = new Map<string, number>();
  const behind = (suit: string) => (picked.get(suit) ?? 0) / inDeck.get(suit)!;

  const chosen = [...medoids];
  const biggestFirst = groups.map((_, k) => k).sort((a, b) => groups[b].length - groups[a].length || a - b);
  for (const k of biggestFirst) {
    chosen[k] = groups[k].reduce((best, card) => (behind(suitOf(card)) < behind(suitOf(best)) ? card : best), medoids[k]);
    picked.set(suitOf(chosen[k]), (picked.get(suitOf(chosen[k])) ?? 0) + groups[k].length);
  }
  return chosen;
}
