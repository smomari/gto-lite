import { describe, expect, it } from "vitest";
import type { ComboRange } from "./types";
import { buildEquityTable } from "./terminalEquity";
import { buildStreetTree } from "./treeBuilder";
import { runCfr } from "./cfr";
import { serializeCombos, serializeTree } from "./serialize";

const BOARD = ["Kh", "7s", "2d"];
const heroRange: ComboRange = [
  { cards: ["Ks", "Kd"], weight: 1 },
  { cards: ["4c", "3h"], weight: 1 },
];
const villainRange: ComboRange = [
  { cards: ["7h", "6c"], weight: 1 },
  { cards: ["9c", "8d"], weight: 1 },
];

describe("serializeTree", () => {
  const tree = buildStreetTree(7.5, 10);
  const table = buildEquityTable(heroRange, villainRange, BOARD);
  const solution = runCfr(tree, heroRange, villainRange, table, 300);
  const serialized = serializeTree(tree, solution);

  it("produces a JSON-safe plain object (no functions survive a roundtrip)", () => {
    const roundTripped = JSON.parse(JSON.stringify(serialized));
    expect(roundTripped).toEqual(serialized);
  });

  it("root is P1's decision with a strategy row per hero combo, actions summing to 1", () => {
    expect(serialized.type).toBe("decision");
    if (serialized.type !== "decision") return;
    expect(serialized.actor).toBe("P1");
    expect(serialized.strategy).toHaveLength(heroRange.length);
    for (const row of serialized.strategy) {
      expect(row.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 6);
    }
    expect(serialized.actions.map((a) => a.action).sort()).toEqual(["allin", "bet", "check"]);
  });

  it("labels a bet/allin action with its size in bb", () => {
    if (serialized.type !== "decision") throw new Error("expected decision");
    const bet = serialized.actions.find((a) => a.action === "bet")!;
    expect(bet.label).toMatch(/^Bet \d+\.\d bb$|^Bet \d+\.\dbb$/);
    const allin = serialized.actions.find((a) => a.action === "allin")!;
    expect(allin.label).toBe("Allin 10.0bb");
  });

  it("a fold terminal carries the winner", () => {
    const checkChild = serialized.type === "decision" ? serialized.actions.find((a) => a.action === "check")!.child : null;
    if (!checkChild || checkChild.type !== "decision") throw new Error("expected P2 decision after check");
    const betChild = checkChild.actions.find((a) => a.action === "bet")!.child;
    if (betChild.type !== "decision") throw new Error("expected P1 facing-bet decision");
    const fold = betChild.actions.find((a) => a.action === "fold")!.child;
    expect(fold).toEqual({ type: "terminal-fold", potBb: expect.any(Number), winner: "P2" });
  });
});

describe("serializeCombos", () => {
  it("passes through cards and weight as a plain array", () => {
    expect(serializeCombos(heroRange)).toEqual([
      { cards: ["Ks", "Kd"], weight: 1 },
      { cards: ["4c", "3h"], weight: 1 },
    ]);
  });
});
