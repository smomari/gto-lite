import { describe, expect, it } from "vitest";
import { computePostflopAvailableActions } from "./betAbstraction";
import { EVERY_CANDIDATE, flopMenu, offersOpeningAllin, pickSizes } from "./flopSizing";
import { applyPostflopAction, initialPostflopPotState } from "./potState";

const use = (third: number, half: number, threeQuarters: number, pot: number) =>
  new Map([
    [0.33, third],
    [0.5, half],
    [0.75, threeQuarters],
    [1.0, pot],
  ]);

describe("pickSizes", () => {
  it("keeps one size for a player who rarely bets: the one used most", () => {
    expect(pickSizes(use(0.01, 0.05, 0.02, 0))).toEqual([0.5]);
  });

  it("keeps a third of a pot when nothing is bet at all", () => {
    expect(pickSizes(new Map())).toEqual([0.33]);
  });

  it("doesn't keep two neighbours: a split between 33% and 50% leaves room for the big bet", () => {
    expect(pickSizes(use(0.46, 0.44, 0, 0.065))).toEqual([0.33, 1.0]);
  });

  it("keeps the small bet and three quarters when those carry the betting", () => {
    expect(pickSizes(use(0.28, 0.05, 0.4, 0.02))).toEqual([0.33, 0.75]);
  });

  it("keeps the two larger sizes on a board that bets big", () => {
    expect(pickSizes(use(0, 0.25, 0.1, 0.3))).toEqual([0.5, 1.0]);
  });
});

describe("flopMenu", () => {
  const opening = initialPostflopPotState(10);
  const facingBet = applyPostflopAction(opening, "P1", "bet", { effectiveStackBb: 100, betToBb: 5 });
  const menu = (allinOpen: boolean) => flopMenu({ P1: [0.33], P2: [0.5, 1.0] }, allinOpen);
  const actions = (state: typeof opening, actor: "P1" | "P2", allinOpen: boolean) =>
    computePostflopAvailableActions(state, actor, 100, "flop", menu(allinOpen)(state, actor));

  it("opens with each player's own sizes, and no all-in on a deep stack", () => {
    expect(actions(opening, "P1", false)).toMatchObject({ bet: [{ toBb: 10 * 0.33 }], allin: null });
    expect(actions(opening, "P2", false)).toMatchObject({ bet: [{ toBb: 5 }, { toBb: 10 }], allin: null });
  });

  it("adds the all-in to the opening bets when asked", () => {
    expect(actions(opening, "P1", true).allin).toEqual({ toBb: 100 });
  });

  it("still opens all-in when no size fits under the stack", () => {
    const state = initialPostflopPotState(10);
    expect(computePostflopAvailableActions(state, "P1", 3, "flop", menu(false)(state, "P1"))).toMatchObject({ bet: [], allin: { toBb: 3 } });
  });

  it("answers a bet with a pot raise or all-in whatever the opening sizes", () => {
    expect(actions(facingBet, "P2", false)).toMatchObject({ bet: [], raise: [{ toBb: 25 }], allin: { toBb: 100 } });
  });

  it("names every candidate for both players", () => {
    expect(EVERY_CANDIDATE.P1).toEqual([0.33, 0.5, 0.75, 1.0]);
    expect(EVERY_CANDIDATE.P2).toEqual(EVERY_CANDIDATE.P1);
  });
});

describe("offersOpeningAllin", () => {
  it("is for stacks of at most three pots", () => {
    expect(offersOpeningAllin(20, 60)).toBe(true);
    expect(offersOpeningAllin(20, 61)).toBe(false);
  });
});
