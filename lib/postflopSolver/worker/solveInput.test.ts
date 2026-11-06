import { describe, expect, it } from "vitest";
import type { PostflopSolveRequest } from "@/types/postflopSolver";
import { toSolveInput } from "./solveInput";

const COMMON = { board: ["Kh", "7s", "2d"], startPot: 6, effectiveStackBb: 97, maxIterations: 500, targetExploitabilityPercent: 0.5, rake: { rate: 0.05, capBb: 3 } };

describe("toSolveInput", () => {
  it("turns a canonical request's action keys into weight functions", () => {
    const hand = { hand: "AKs", fold: 0.1, call: 0.3, raise: 0.6 };
    const request: PostflopSolveRequest = {
      ...COMMON,
      kind: "canonical",
      heroHandFrequencies: [hand],
      heroActionKey: "raise",
      villainHandFrequencies: [hand],
      villainActionKey: "allin",
      fast: true,
    };
    const input = toSolveInput(request);
    if (input.kind !== "canonical") throw new Error("expected a canonical input");
    expect(input).toMatchObject({ ...COMMON, fast: true, heroHandFrequencies: [hand], villainHandFrequencies: [hand] });
    expect(input).not.toHaveProperty("heroActionKey");
    expect(input.heroActionWeight(hand)).toBe(0.6);
    // A hand without an allin frequency weighs nothing for an allin range.
    expect(input.villainActionWeight(hand)).toBe(0);
  });

  it("passes a combos request through as it is", () => {
    const request: PostflopSolveRequest = {
      ...COMMON,
      kind: "combos",
      heroRange: [{ cards: ["Ah", "Kd"], weight: 0.5 }],
      villainRange: [{ cards: ["Qs", "Qc"], weight: 1 }],
    };
    expect(toSolveInput(request)).toEqual(request);
  });
});
