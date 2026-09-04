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
  const tree = buildStreetTree(7.5, 10, "flop");
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
    // Flop has 2 bet sizes, so "bet" appears twice among the root's actions.
    const actionCounts = serialized.actions.reduce<Record<string, number>>((acc, a) => {
      acc[a.action] = (acc[a.action] ?? 0) + 1;
      return acc;
    }, {});
    expect(actionCounts).toEqual({ check: 1, bet: 2, allin: 1 });
  });

  it("labels bet/allin actions with their size in bb", () => {
    if (serialized.type !== "decision") throw new Error("expected decision");
    const bets = serialized.actions.filter((a) => a.action === "bet");
    for (const bet of bets) expect(bet.label).toMatch(/^Bet \d+\.\dbb$/);
    const allin = serialized.actions.find((a) => a.action === "allin")!;
    expect(allin.label).toBe("Allin 10.0bb");
  });

  it("labels a raise action with 'Raise to Xbb'", () => {
    // A deeper stack than the shared fixture's (10bb) is needed for a
    // full-pot raise to have room to exist rather than collapsing into allin.
    const deepTree = buildStreetTree(7.5, 40, "flop");
    const deepSolution = runCfr(deepTree, heroRange, villainRange, buildEquityTable(heroRange, villainRange, BOARD), 300);
    const deepSerialized = serializeTree(deepTree, deepSolution);
    if (deepSerialized.type !== "decision") throw new Error("expected decision");
    const betChild = deepSerialized.actions.find((a) => a.action === "bet")!.child;
    if (betChild.type !== "decision") throw new Error("expected P2 facing-bet decision");
    const raise = betChild.actions.find((a) => a.action === "raise")!;
    expect(raise.label).toMatch(/^Raise to \d+\.\dbb$/);
  });

  it("a fold terminal carries the winner", () => {
    const checkChild = serialized.type === "decision" ? serialized.actions.find((a) => a.action === "check")!.child : null;
    if (!checkChild || checkChild.type !== "decision") throw new Error("expected P2 decision after check");
    const betChild = checkChild.actions.find((a) => a.action === "bet")!.child;
    if (betChild.type !== "decision") throw new Error("expected P1 facing-bet decision");
    const fold = betChild.actions.find((a) => a.action === "fold")!.child;
    expect(fold).toEqual({
      type: "terminal-fold",
      potBb: expect.any(Number),
      winner: "P2",
      committed: { P1: expect.any(Number), P2: expect.any(Number) },
    });
  });

  it("committed is symmetric at a terminal-showdown (uniform-stack model)", () => {
    const checkChild = serialized.type === "decision" ? serialized.actions.find((a) => a.action === "check")!.child : null;
    if (!checkChild || checkChild.type !== "decision") throw new Error("expected P2 decision after check");
    const callChild = checkChild.actions.find((a) => a.action === "check")!.child;
    expect(callChild.type).toBe("terminal-showdown");
    if (callChild.type !== "terminal-showdown") return;
    expect(callChild.committed.P1).toBe(callChild.committed.P2);
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
