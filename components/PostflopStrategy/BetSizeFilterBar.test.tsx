import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BetSizeFilterBar } from "./BetSizeFilterBar";
import { buildActionColorScale } from "./postflopColorLegend";
import type { SerializedCombo, SerializedDecisionNode } from "@/types/postflopSolver";

function terminal(potBb: number): SerializedDecisionNode["actions"][number]["child"] {
  return { type: "terminal-showdown", potBb, committed: { P1: 0, P2: 0 } };
}

describe("BetSizeFilterBar", () => {
  const node: SerializedDecisionNode = {
    type: "decision",
    actor: "P1",
    potBb: 10,
    currentBetToCall: 0,
    actions: [
      { action: "check", label: "Check", child: terminal(10) },
      { action: "bet", label: "Bet 33%", child: terminal(13) },
      { action: "bet", label: "Bet 66%", child: terminal(16) },
    ],
    strategy: [
      [0.5, 0.2, 0.3],
      [0.1, 0.3, 0.6],
    ],
  };
  const range: SerializedCombo[] = [
    { cards: ["As", "Ah"], weight: 1 },
    { cards: ["Kc", "Kd"], weight: 1 },
  ];

  it("renders one button per action with its range-weighted frequency", () => {
    render(
      <BetSizeFilterBar
        node={node}
        range={range}
        colors={buildActionColorScale(node.actions)}
        isolatedActionIndex={null}
        onIsolateChange={() => {}}
      />,
    );
    // Check = (0.5+0.1)/2 = 30.0%
    expect(screen.getByRole("button", { name: /Check · 30.0%/ })).toBeInTheDocument();
    // Bet 33% = (0.2+0.3)/2 = 25.0%
    expect(screen.getByRole("button", { name: /Bet 33% · 25.0%/ })).toBeInTheDocument();
    // Bet 66% = (0.3+0.6)/2 = 45.0%
    expect(screen.getByRole("button", { name: /Bet 66% · 45.0%/ })).toBeInTheDocument();
  });

  it("clicking a button isolates it, clicking again clears the isolation", () => {
    const onIsolateChange = vi.fn();
    const { rerender } = render(
      <BetSizeFilterBar
        node={node}
        range={range}
        colors={buildActionColorScale(node.actions)}
        isolatedActionIndex={null}
        onIsolateChange={onIsolateChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Bet 33%/ }));
    expect(onIsolateChange).toHaveBeenCalledWith(1);

    rerender(
      <BetSizeFilterBar
        node={node}
        range={range}
        colors={buildActionColorScale(node.actions)}
        isolatedActionIndex={1}
        onIsolateChange={onIsolateChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Bet 33%/ }));
    expect(onIsolateChange).toHaveBeenLastCalledWith(null);
  });
});
