import { describe, expect, it } from "vitest";
import type { SerializedDecisionAction } from "@/types/postflopSolver";
import { buildActionColorScale, readableTextColor } from "./postflopColorLegend";

function terminal(): SerializedDecisionAction["child"] {
  return { type: "terminal-showdown", potBb: 10, committed: { P1: 0, P2: 0 } };
}

function action(action: SerializedDecisionAction["action"], label: string): SerializedDecisionAction {
  return { action, label, child: terminal() };
}

describe("buildActionColorScale", () => {
  it("gives flop's 2 bet sizes two distinct colors", () => {
    const actions = [action("check", "Check"), action("bet", "Bet 3.5bb"), action("bet", "Bet 7.1bb")];
    const colors = buildActionColorScale(actions);
    expect(colors).toHaveLength(3);
    expect(colors[1]).not.toBe(colors[2]);
  });

  it("gives turn/river's 3 bet sizes three distinct colors", () => {
    const actions = [
      action("check", "Check"),
      action("bet", "Bet 2.3bb"),
      action("bet", "Bet 4.6bb"),
      action("bet", "Bet 7.0bb"),
    ];
    const colors = buildActionColorScale(actions);
    const betColors = colors.slice(1);
    expect(new Set(betColors).size).toBe(3);
  });

  it("bet and raise ramps never overlap", () => {
    const actions = [
      action("fold", "Fold"),
      action("call", "Call"),
      action("bet", "Bet 5.0bb"),
      action("raise", "Raise to 12.0bb"),
    ];
    const colors = buildActionColorScale(actions);
    expect(colors[2]).not.toBe(colors[3]);
  });

  it("fold/check/call/allin keep their fixed type-level colors", () => {
    const actions = [action("fold", "Fold"), action("check", "Check"), action("call", "Call"), action("allin", "Allin 50bb")];
    const colors = buildActionColorScale(actions);
    expect(colors).toEqual(["#9ca3af", "#60a5fa", "#3b82f6", "#7f1d1d"]);
  });

  it("a single bet size still gets a valid color (no division by zero)", () => {
    const actions = [action("check", "Check"), action("bet", "Bet 5.0bb")];
    const colors = buildActionColorScale(actions);
    expect(colors[1]).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("readableTextColor", () => {
  it("returns dark text for a light background", () => {
    expect(readableTextColor("#fde68a")).toBe("#111827");
  });

  it("returns light text for a dark background", () => {
    expect(readableTextColor("#7f1d1d")).toBe("#f9fafb");
  });
});
