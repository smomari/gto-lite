import { remainingDeck } from "@/lib/cards";
import { handRank } from "../handEval";
import { CARD_INDEX } from "../flattenTree";
import type { EquityTable } from "../terminalEquity";
import type { ComboRange } from "../types";
import type { SolverModule } from "./solverModule";

/** Above phe's largest rank (7462), so every real hand maps to a positive strength; 0 marks "not a runout". */
const STRENGTH_BASE = 7463;
const SLOTS = 1326;

/** Stable slot for an unordered card pair — same indexing as terminalEquity.ts's pairIndex. */
function pairSlot(a: number, b: number): number {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return lo * 52 - (lo * (lo + 1)) / 2 + (hi - lo - 1);
}

/** Each combo's strength on every (turn, river) runout of the flop: [combo * 1326 + slot], bigger = better, 0 = not a runout. */
function runoutStrengths(range: ComboRange, flop: string[]): Uint16Array {
  const out = new Uint16Array(range.length * SLOTS);
  range.forEach(({ cards }, c) => {
    const deck = remainingDeck([...cards, ...flop]);
    for (let x = 0; x < deck.length; x++) {
      for (let y = x + 1; y < deck.length; y++) {
        out[c * SLOTS + pairSlot(CARD_INDEX[deck[x]], CARD_INDEX[deck[y]])] = STRENGTH_BASE - handRank([...cards, ...flop, deck[x], deck[y]]);
      }
    }
  });
  return out;
}

function sharesNoCard(a: [string, string], b: [string, string], card: string): boolean {
  return a[0] !== b[0] && a[0] !== b[1] && a[1] !== b[0] && a[1] !== b[1] && !a.includes(card) && !b.includes(card);
}

/**
 * A flop's equity tables, built by the C++ core (native/solver/equity.cpp)
 * from each combo's strength on every runout: hand evaluation happens once
 * per (combo, runout), and the flop's own table and each turn card's table are
 * just different runout subsets of the same strengths. Ranges must be the
 * solve's own (board-blocked combos already removed). Holds WASM memory until
 * `dispose`.
 */
export class RunoutEquity {
  private constructor(
    private readonly solver: SolverModule,
    private readonly handle: number,
    private readonly flop: string[],
    private readonly heroCount: number,
    private readonly villainCount: number,
  ) {}

  static create(solver: SolverModule, hero: ComboRange, villain: ComboRange, flop: string[]): RunoutEquity {
    const pointers: number[] = [];
    const put = (array: Uint8Array | Uint16Array) => {
      const ptr = solver._malloc(Math.max(array.byteLength, 4));
      solver.HEAPU8.set(new Uint8Array(array.buffer, array.byteOffset, array.byteLength), ptr);
      pointers.push(ptr);
      return ptr;
    };
    const cardsOf = (range: ComboRange) => Uint8Array.from(range.flatMap((c) => [CARD_INDEX[c.cards[0]], CARD_INDEX[c.cards[1]]]));
    try {
      const handle = solver._eq_create(
        hero.length,
        put(cardsOf(hero)),
        put(runoutStrengths(hero, flop)),
        villain.length,
        put(cardsOf(villain)),
        put(runoutStrengths(villain, flop)),
      );
      return new RunoutEquity(solver, handle, flop, hero.length, villain.length);
    } finally {
      for (const ptr of pointers) solver._free(ptr);
    }
  }

  private table(slots: number[], unavailable: number): Float32Array {
    const slotPtr = this.solver._malloc(Math.max(slots.length, 1) * 2);
    const outPtr = this.solver._malloc(Math.max(this.heroCount * this.villainCount, 1) * 4);
    try {
      this.solver.HEAPU16.set(slots, slotPtr / 2);
      this.solver._eq_table(this.handle, slots.length, slotPtr, unavailable, outPtr);
      return this.solver.HEAPF32.slice(outPtr / 4, outPtr / 4 + this.heroCount * this.villainCount);
    } finally {
      this.solver._free(slotPtr);
      this.solver._free(outPtr);
    }
  }

  /** The flop's own table over every runout, as terminalEquity.ts's buildEquityTable returns it (NaN = card-blocked pair). */
  flopTable(): EquityTable {
    const deck = remainingDeck(this.flop).map((c) => CARD_INDEX[c]);
    const slots: number[] = [];
    for (let x = 0; x < deck.length; x++) for (let y = x + 1; y < deck.length; y++) slots.push(pairSlot(deck[x], deck[y]));
    const hero = this.table(slots, NaN);
    const { heroCount, villainCount } = this;
    const heroEquity = Float64Array.from(hero);
    const villainEquity = new Float64Array(villainCount * heroCount);
    for (let i = 0; i < heroCount; i++) {
      for (let j = 0; j < villainCount; j++) villainEquity[j * heroCount + i] = 1 - heroEquity[i * villainCount + j];
    }
    return { heroCount, villainCount, heroEquity, villainEquity };
  }

  /** One turn card's table over the rivers under it, in the engine's layout (0 = card-blocked pair, or a combo holding the turn card). */
  turnTable(turnCard: string): Float32Array {
    const turn = CARD_INDEX[turnCard];
    const slots = remainingDeck([...this.flop, turnCard]).map((river) => pairSlot(turn, CARD_INDEX[river]));
    return this.table(slots, 0);
  }

  /**
   * How a turn card plays: each combo's equity against the other range once it
   * lands, weighted by the combo's reach (hero combos, then villain combos). A
   * combo holding the card can't see it, and reads as NaN.
   */
  turnFeatures(turnCard: string, hero: ComboRange, villain: ComboRange): Float32Array {
    const table = this.turnTable(turnCard);
    const { heroCount, villainCount } = this;
    const heroEquity = new Float64Array(heroCount), heroMass = new Float64Array(heroCount);
    const villainEquity = new Float64Array(villainCount), villainMass = new Float64Array(villainCount);
    for (let i = 0; i < heroCount; i++) {
      for (let j = 0; j < villainCount; j++) {
        const equity = table[i * villainCount + j];
        if (equity === 0 && !sharesNoCard(hero[i].cards, villain[j].cards, turnCard)) continue;
        heroEquity[i] += villain[j].weight * equity;
        heroMass[i] += villain[j].weight;
        villainEquity[j] += hero[i].weight * (1 - equity);
        villainMass[j] += hero[i].weight;
      }
    }
    const out = new Float32Array(heroCount + villainCount);
    const heroTotal = hero.reduce((sum, c) => sum + c.weight, 0), villainTotal = villain.reduce((sum, c) => sum + c.weight, 0);
    for (let i = 0; i < heroCount; i++) out[i] = heroMass[i] > 0 ? (Math.sqrt(hero[i].weight / heroTotal) * heroEquity[i]) / heroMass[i] : NaN;
    for (let j = 0; j < villainCount; j++) out[heroCount + j] = villainMass[j] > 0 ? (Math.sqrt(villain[j].weight / villainTotal) * villainEquity[j]) / villainMass[j] : NaN;
    return out;
  }

  dispose(): void {
    this.solver._eq_destroy(this.handle);
  }
}
