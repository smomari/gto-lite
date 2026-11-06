import { describe, expect, it } from "vitest";
import { bubbleFactor, icmEquity } from "./malmuthHarville";

const table = (tableStacks: number[], payouts: number[], offTablePlayers = 0, offTableStack = 0) => ({
  tableStacks,
  payouts,
  offTablePlayers,
  offTableStack,
});

describe("icmEquity", () => {
  it("matches a three-player example worked by hand", () => {
    // A: 1st .5, 2nd .3·50/70 + .2·50/80, 3rd the rest. C follows from the total.
    const [a, b, c] = icmEquity(table([50, 30, 20], [50, 30, 20]));
    expect(a).toBeCloseTo(38.392857, 5);
    expect(b).toBeCloseTo(32.75, 5);
    expect(c).toBeCloseTo(28.857143, 5);
  });

  it("hands out the whole prize pool and gives equal stacks equal shares", () => {
    const payouts = [40, 25, 15, 10, 6, 4];
    const equity = icmEquity(table([20, 20, 20, 20, 20, 20, 20, 20], payouts));
    expect(equity.reduce((s, v) => s + v, 0)).toBeCloseTo(100, 8);
    for (const v of equity) expect(v).toBeCloseTo(12.5, 8);
  });

  it("treats the players away from the table the same as seated ones", () => {
    const payouts = [50, 30, 20];
    const grouped = icmEquity(table([40, 10], payouts, 2, 25));
    const seated = icmEquity(table([40, 10, 25, 25], payouts));
    expect(grouped[0]).toBeCloseTo(seated[0], 10);
    expect(grouped[1]).toBeCloseTo(seated[1], 10);
  });

  it("gives a busted seat the place below everyone still in", () => {
    const [a, b, c] = icmEquity(table([60, 40, 0], [50, 30, 20]));
    expect(c).toBe(20);
    expect(a).toBeCloseTo(42, 10);
    expect(b).toBeCloseTo(38, 10);
  });

  it("is the chip share when the winner takes all", () => {
    const [a, b] = icmEquity(table([30, 10], [1], 3, 20));
    expect(a).toBeCloseTo(30 / 100, 10);
    expect(b).toBeCloseTo(10 / 100, 10);
  });
});

describe("bubbleFactor", () => {
  it("is 1 when the winner takes all", () => {
    expect(bubbleFactor(table([20, 20, 20], [1]), 0, 1, 20)).toBeCloseTo(1, 10);
  });

  it("is above 1 on the bubble and grows as more is risked", () => {
    const bubble = table([20, 20, 20, 20], [50, 30, 20]);
    const small = bubbleFactor(bubble, 0, 1, 5);
    const allIn = bubbleFactor(bubble, 0, 1, 20);
    expect(small).toBeGreaterThan(1);
    expect(allIn).toBeGreaterThan(small);
  });
});
