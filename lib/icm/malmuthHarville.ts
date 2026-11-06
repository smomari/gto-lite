/**
 * Who is left in the tournament: the stacks at this table, and the players
 * elsewhere, all taken to hold the same stack. Payouts are per place from
 * first; places past the last one pay nothing.
 */
export interface IcmField {
  tableStacks: readonly number[];
  offTablePlayers: number;
  offTableStack: number;
  payouts: readonly number[];
}

/**
 * Each table seat's expected payout under Malmuth-Harville: first place goes
 * to a player with probability proportional to stack, then second among the
 * rest the same way, and so on. The players away from the table are
 * interchangeable, so the state is which table seats have placed and how many
 * of the others have: at most 2^seats states per place instead of 2^players.
 * Players with no chips have busted here and share the places below everyone
 * still in.
 */
export function icmEquity(field: IcmField): number[] {
  const { tableStacks: stacks, offTablePlayers: others, offTableStack: otherStack, payouts } = field;
  const equity = stacks.map(() => 0);
  const otherCount = otherStack > 0 ? others : 0;
  const alive = stacks.filter((s) => s > 0).length + otherCount;
  const totalChips = stacks.reduce((sum, s) => sum + Math.max(s, 0), 0) + otherCount * otherStack;
  const stride = otherCount + 1;

  // Probability of each state with `place` places handed out: key = placed table seats (a bitmask) * stride + others placed.
  let layer = new Map<number, number>([[0, 1]]);
  for (let place = 0; place < Math.min(payouts.length, alive); place++) {
    const next = new Map<number, number>();
    const add = (key: number, p: number) => next.set(key, (next.get(key) ?? 0) + p);
    for (const [key, p] of layer) {
      const mask = Math.floor(key / stride);
      const othersPlaced = key % stride;
      let chipsLeft = totalChips - othersPlaced * otherStack;
      for (let i = 0; i < stacks.length; i++) if (mask & (1 << i)) chipsLeft -= stacks[i];
      for (let i = 0; i < stacks.length; i++) {
        if (stacks[i] <= 0 || mask & (1 << i)) continue;
        const q = (p * stacks[i]) / chipsLeft;
        equity[i] += q * payouts[place];
        add((mask | (1 << i)) * stride + othersPlaced, q);
      }
      if (othersPlaced < otherCount) add(key + 1, (p * (otherCount - othersPlaced) * otherStack) / chipsLeft);
    }
    layer = next;
  }

  const busted = stacks.flatMap((s, i) => (s > 0 ? [] : [i]));
  if (busted.length > 0) {
    const share = payouts.slice(alive, alive + busted.length).reduce((sum, v) => sum + v, 0) / busted.length;
    for (const i of busted) equity[i] = share;
  }
  return equity;
}

/**
 * How much more seat `hero` loses by losing `amountBb` to `villain` than it
 * gains by winning it from them, both against keeping the stacks as they are.
 * 1 in a chip-EV game; above 1 the more it costs to bust.
 */
export function bubbleFactor(field: IcmField, hero: number, villain: number, amountBb: number): number {
  const valueWith = (heroDelta: number) => {
    const stacks = [...field.tableStacks];
    const moved = Math.min(amountBb, heroDelta > 0 ? stacks[villain] : stacks[hero]);
    stacks[hero] += Math.sign(heroDelta) * moved;
    stacks[villain] -= Math.sign(heroDelta) * moved;
    return icmEquity({ ...field, tableStacks: stacks })[hero];
  };
  const base = valueWith(0);
  return (base - valueWith(-1)) / (valueWith(1) - base);
}
