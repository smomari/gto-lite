// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ALL_HANDS } from "@/lib/handRange/handList";
import { expandToCombos } from "../combos";
import { buildEquityTable } from "../terminalEquity";
import { engineEquityTable } from "../engineBoards";
import { loadNodeSolverModule } from "./loadNode";
import { RunoutEquity } from "./runoutEquity";

const FLOP = ["Kh", "7s", "2d"];
const range = (from: number, to: number) =>
  expandToCombos(
    ALL_HANDS.slice(from, to).map((h) => ({ hand: h.hand, fold: 0, call: 1, raise: 0 })),
    (hf) => hf.call,
    FLOP,
  );
const hero = range(0, 10);
const villain = range(5, 18);

describe("RunoutEquity", () => {
  it("builds the flop's table exactly like buildEquityTable (NaN where a card is shared)", async () => {
    const runout = RunoutEquity.create(await loadNodeSolverModule(), hero, villain, FLOP);
    try {
      const got = runout.flopTable();
      const want = buildEquityTable(hero, villain, FLOP);
      want.heroEquity.forEach((x, k) => {
        if (Number.isNaN(x)) expect(got.heroEquity[k]).toBeNaN();
        else expect(Math.abs(got.heroEquity[k] - x)).toBeLessThan(1e-6);
      });
      want.villainEquity.forEach((x, k) => {
        if (Number.isNaN(x)) expect(got.villainEquity[k]).toBeNaN();
        else expect(Math.abs(got.villainEquity[k] - x)).toBeLessThan(1e-6);
      });
    } finally {
      runout.dispose();
    }
  });

  it("builds each turn card's table like engineEquityTable on that turn board (0 for combos holding the card)", async () => {
    const runout = RunoutEquity.create(await loadNodeSolverModule(), hero, villain, FLOP);
    try {
      for (const turn of ["As", "Kd", "7h", "9c"]) {
        const got = runout.turnTable(turn);
        const want = engineEquityTable(hero, villain, [...FLOP, turn]);
        want.forEach((x, k) => expect(Math.abs(got[k] - x)).toBeLessThan(1e-6));
      }
    } finally {
      runout.dispose();
    }
  });
});
