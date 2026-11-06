import { describe, expect, it } from "vitest";
import { DEFAULT_MAX_CFR_ITERATIONS, DEFAULT_TARGET_EXPLOITABILITY_PERCENT } from "@/lib/postflopSolver/cfr";
import { NO_RAKE } from "@/lib/solveEngine/rake";
import type { SerializedChanceNode, SerializedDecisionNode } from "@/types/postflopSolver";
import {
  buildStreetSolveRequest,
  idleStage,
  pickDifferentLabel,
  streetStartPot,
  type StreetSolveInputs,
  type StreetStage,
} from "./streetStages";

const HAND = { hand: "AKs", fold: 0, call: 1, raise: 0 };
const INPUTS: StreetSolveInputs = {
  heroHands: [HAND],
  heroActionKey: "call",
  villainHands: [HAND],
  villainActionKey: "raise",
  startPot: 6,
  effectiveStackBb: 97,
  rake: NO_RAKE,
};

const chance: SerializedChanceNode = { type: "chance", potBb: 18, committed: { P1: 6, P2: 6 } };
/** P1 bets (action 0) half the time with its first combo and always with its second; P2 calls into the chance node. */
const p1Bet: SerializedDecisionNode = {
  type: "decision",
  actor: "P1",
  potBb: 6,
  currentBetToCall: 0,
  actions: [{ action: "bet", label: "Bet 6", child: chance }],
  strategy: [[0.5], [1]],
};

function flopClosedAtChance(): StreetStage {
  return {
    ...idleStage(3, 97),
    board: ["As", "Kd", "Qh"],
    state: {
      kind: "done",
      result: {
        type: "result",
        tree: p1Bet,
        heroRange: [
          { cards: ["Ah", "Kh"], weight: 1 },
          { cards: ["Jc", "Tc"], weight: 1 },
        ],
        villainRange: [{ cards: ["9s", "9d"], weight: 0.8 }],
        iterations: 100,
      },
    },
    currentNode: chance,
    path: [{ node: p1Bet, actionIndex: 0 }],
  };
}

describe("buildStreetSolveRequest", () => {
  it("starts the flop from the preflop ranges", () => {
    const request = buildStreetSolveRequest([idleStage(3, 97)], 0, ["As", "Kd", "Qh"], INPUTS, true);
    expect(request).toEqual({
      kind: "canonical",
      board: ["As", "Kd", "Qh"],
      heroHandFrequencies: [HAND],
      heroActionKey: "call",
      villainHandFrequencies: [HAND],
      villainActionKey: "raise",
      startPot: 6,
      effectiveStackBb: 97,
      fast: true,
      maxIterations: DEFAULT_MAX_CFR_ITERATIONS,
      targetExploitabilityPercent: DEFAULT_TARGET_EXPLOITABILITY_PERCENT,
      rake: NO_RAKE,
    });
  });

  it("starts a later street from the previous street's ranges, narrowed along the line that closed it", () => {
    const streets = [flopClosedAtChance(), idleStage(4, 91)];
    const request = buildStreetSolveRequest(streets, 1, ["7h"], INPUTS, true);
    expect(request).toEqual({
      kind: "combos",
      board: ["As", "Kd", "Qh", "7h"],
      heroRange: [
        { cards: ["Ah", "Kh"], weight: 0.5 },
        { cards: ["Jc", "Tc"], weight: 1 },
      ],
      villainRange: [{ cards: ["9s", "9d"], weight: 0.8 }],
      startPot: 18,
      effectiveStackBb: 91,
      maxIterations: DEFAULT_MAX_CFR_ITERATIONS,
      targetExploitabilityPercent: DEFAULT_TARGET_EXPLOITABILITY_PERCENT,
      rake: NO_RAKE,
    });
  });

  it("refuses a later street whose previous one didn't close at a chance node", () => {
    expect(() => buildStreetSolveRequest([idleStage(3, 97), idleStage(4, 97)], 1, ["7h"], INPUTS, false)).toThrow(/chance node/);
  });
});

describe("streetStartPot", () => {
  it("is the preflop pot for the flop and the previous street's closing pot after it", () => {
    const streets = [flopClosedAtChance(), idleStage(4, 91)];
    expect(streetStartPot(streets, 0, 6)).toBe(6);
    expect(streetStartPot(streets, 1, 6)).toBe(18);
    expect(streetStartPot([idleStage(3, 97), idleStage(4, 97)], 1, 6)).toBe(6);
  });
});

describe("pickDifferentLabel", () => {
  it("names the board on the flop and the single card after it", () => {
    expect(pickDifferentLabel(idleStage(3, 97))).toBe("Pick a different board");
    expect(pickDifferentLabel(idleStage(5, 97))).toBe("Pick a different river card");
  });
});
