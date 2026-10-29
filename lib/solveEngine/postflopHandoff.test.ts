import { describe, expect, it } from "vitest";
import type { ActionNode, ActionType, Position } from "@/types/rangeData";
import type { SolveResponse } from "@/types/solveApi";
import { actionPathKey, resolvePostflopHandoff } from "./postflopHandoff";

function step(actor: Position, action: ActionType): ActionNode {
  return { actor, action, label: action };
}

/** A decision-point response whose single hand label tags which decision it came from. */
function response(seat: Position, path: ActionNode[], tag: string): SolveResponse {
  return {
    heroPosition: seat,
    stackDepth: 100,
    nodeId: "",
    actionPath: path,
    source: "heuristic-approx",
    generatedAt: "",
    version: "",
    hands: [{ hand: tag, fold: 0, call: 1, raise: 0 }],
    potBb: 0,
    currentBetToCall: 0,
    availableActions: { fold: true, call: null, raise: null, allin: { toBb: 100 } },
  };
}

/** Stores the response each seat saw at each of its decisions along `path`, keyed the way the page does. */
function capture(path: ActionNode[]): Record<string, SolveResponse> {
  const byKey: Record<string, SolveResponse> = {};
  path.forEach((node, i) => {
    const prefix = path.slice(0, i);
    byKey[actionPathKey(prefix)] = response(node.actor, prefix, `${node.actor}@${i}`);
  });
  return byKey;
}

const foldsUtg1ToHj = [step("UTG1", "fold"), step("LJ", "fold"), step("HJ", "fold")];

describe("resolvePostflopHandoff", () => {
  it("open-call: pairs the two live seats OOP first, each with its own last-decision range and action", () => {
    const path = [
      step("UTG", "raise"),
      ...foldsUtg1ToHj,
      step("CO", "fold"),
      step("BTN", "fold"),
      step("SB", "fold"),
      step("BB", "call"),
    ];
    const { matchup } = resolvePostflopHandoff(path, { SB: 0.5, BB: 2.8, UTG: 2.8 }, 100, capture(path));

    expect(matchup?.map((s) => s.seat)).toEqual(["BB", "UTG"]);
    expect(matchup?.[0]).toMatchObject({ actionKey: "call", remainingBb: 97.2, hands: [{ hand: "BB@7" }] });
    expect(matchup?.[1]).toMatchObject({ actionKey: "raise", hands: [{ hand: "UTG@0" }] });
  });

  it("3-bet + cold call, opener folds: CO vs BTN, each range taken from its own decision point", () => {
    const path = [
      step("UTG", "raise"),
      ...foldsUtg1ToHj,
      step("CO", "raise"),
      step("BTN", "call"),
      step("SB", "fold"),
      step("BB", "fold"),
      step("UTG", "fold"),
    ];
    const { matchup } = resolvePostflopHandoff(
      path,
      { SB: 0.5, BB: 1, UTG: 2.8, CO: 8.4, BTN: 8.4 },
      100,
      capture(path),
    );

    expect(matchup?.map((s) => s.seat)).toEqual(["CO", "BTN"]);
    expect(matchup?.[0]).toMatchObject({ actionKey: "raise", hands: [{ hand: "CO@4" }] });
    expect(matchup?.[1]).toMatchObject({ actionKey: "call", hands: [{ hand: "BTN@5" }] });
  });

  it("opener calls a 3-bet: its range is the facing-3-bet decision, not its earlier opening range", () => {
    const path = [
      step("UTG", "raise"),
      ...foldsUtg1ToHj,
      step("CO", "raise"),
      step("BTN", "fold"),
      step("SB", "fold"),
      step("BB", "fold"),
      step("UTG", "call"),
    ];
    const { matchup } = resolvePostflopHandoff(path, { SB: 0.5, BB: 1, UTG: 8.4, CO: 8.4 }, 100, capture(path));

    expect(matchup?.map((s) => s.seat)).toEqual(["UTG", "CO"]);
    expect(matchup?.[0]).toMatchObject({ actionKey: "call", remainingBb: 91.6, hands: [{ hand: "UTG@8" }] });
  });

  it("no matchup until both live seats' ranges have arrived", () => {
    const path = [step("UTG", "raise"), ...foldsUtg1ToHj, step("CO", "call"), step("BTN", "fold"), step("SB", "fold"), step("BB", "fold")];
    const ranges = capture(path);
    delete ranges[actionPathKey(path.slice(0, 4))]; // CO's decision response not back yet

    const { liveSeats, matchup } = resolvePostflopHandoff(path, { SB: 0.5, BB: 1, UTG: 2.8, CO: 2.8 }, 100, ranges);
    expect(matchup).toBeNull();
    expect(liveSeats.map((s) => [s.seat, s.hands !== null])).toEqual([
      ["UTG", true],
      ["CO", false],
    ]);
  });

  it("ignores a response stored under the right path but for a different seat", () => {
    const path = [step("UTG", "raise"), ...foldsUtg1ToHj, step("CO", "fold"), step("BTN", "fold"), step("SB", "fold"), step("BB", "call")];
    const ranges = capture(path);
    ranges[actionPathKey(path.slice(0, 7))] = response("SB", path.slice(0, 7), "wrong");

    expect(resolvePostflopHandoff(path, { SB: 0.5, BB: 2.8, UTG: 2.8 }, 100, ranges).matchup).toBeNull();
  });

  it("3 live seats (multiway) never produce a matchup", () => {
    const path = [
      step("UTG", "raise"),
      ...foldsUtg1ToHj,
      step("CO", "call"),
      step("BTN", "call"),
      step("SB", "fold"),
      step("BB", "fold"),
    ];
    const { liveSeats, matchup } = resolvePostflopHandoff(
      path,
      { SB: 0.5, BB: 1, UTG: 2.8, CO: 2.8, BTN: 2.8 },
      100,
      capture(path),
    );
    expect(liveSeats).toHaveLength(3);
    expect(matchup).toBeNull();
  });
});
