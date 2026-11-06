import { icmById, seatEquities, type IcmId } from "@/lib/solveEngine/icm";
import { NODE_FOLD, NODE_SHOWDOWN_RIVER, NODE_SHOWDOWN_TABLE, type FlatTree } from "./flattenTree";

/** The tournament a postflop hand is played in, as a request carries it. */
export interface PostflopIcm {
  icm: IcmId;
  /** Seats at the table. */
  seats: number;
  /** The stack every seat and every player left started the hand with. */
  stackBb: number;
}

/** Each player's terminal payoffs, as eng_set_payoffs reads them. */
export interface TerminalPayoffs {
  won1: Float32Array;
  risked1: Float32Array;
  won2: Float32Array;
  risked2: Float32Array;
}

/**
 * Each terminal's prize-money value to each player, in place of its chips.
 * Both start the street with `remainingBb` behind; the other seats and the
 * field keep their starting stack. Values are measured from the stacks at the
 * root with the pot nobody's yet, and scaled to chips at the rate the pot
 * changes hands there, so they read like bb: winning a terminal is worth less
 * than losing it costs, where in chips the two would match.
 */
export function icmTerminalPayoffs(flat: FlatTree, remainingBb: number, tournament: PostflopIcm): TerminalPayoffs {
  const structure = icmById(tournament.icm);
  if (!structure) throw new Error(`Unknown icm: ${tournament.icm}`);
  const others = Array<number>(Math.max(0, tournament.seats - 2)).fill(tournament.stackBb);
  const cache = new Map<string, number[]>();
  const valueAt = (stack1: number, stack2: number) => {
    const key = `${stack1}:${stack2}`;
    let values = cache.get(key);
    if (!values) {
      values = seatEquities(structure, [stack1, stack2, ...others], tournament.stackBb);
      cache.set(key, values);
    }
    return values;
  };

  const root = valueAt(remainingBb, remainingBb);
  const step = Math.min(1, remainingBb / 2);
  const perBb = step > 0 ? (valueAt(remainingBb + step, remainingBb - step)[0] - valueAt(remainingBb - step, remainingBb + step)[0]) / (2 * step) : 0;
  const scale = perBb > 0 ? 1 / perBb : 1;

  const payoffs: TerminalPayoffs = {
    won1: Float32Array.from(flat.pot),
    risked1: Float32Array.from(flat.committed1),
    won2: Float32Array.from(flat.pot),
    risked2: Float32Array.from(flat.committed2),
  };
  for (let i = 0; i < flat.nodeCount; i++) {
    const type = flat.type[i];
    if (type !== NODE_FOLD && type !== NODE_SHOWDOWN_TABLE && type !== NODE_SHOWDOWN_RIVER) continue;
    const stack1 = remainingBb - flat.committed1[i];
    const stack2 = remainingBb - flat.committed2[i];
    const p1Wins = valueAt(stack1 + flat.pot[i], stack2);
    const p2Wins = valueAt(stack1, stack2 + flat.pot[i]);
    payoffs.won1[i] = (p1Wins[0] - p2Wins[0]) * scale;
    payoffs.risked1[i] = (root[0] - p2Wins[0]) * scale;
    payoffs.won2[i] = (p2Wins[1] - p1Wins[1]) * scale;
    payoffs.risked2[i] = (root[1] - p1Wins[1]) * scale;
  }
  return payoffs;
}
