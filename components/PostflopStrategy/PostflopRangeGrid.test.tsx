import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PostflopRangeGrid } from "./PostflopRangeGrid";
import type { SerializedCombo, SerializedDecisionNode } from "@/types/postflopSolver";

function terminal(potBb: number): SerializedDecisionNode["actions"][number]["child"] {
  return { type: "terminal-showdown", potBb, committed: { P1: 0, P2: 0 } };
}

describe("PostflopRangeGrid", () => {
  it("renders all 169 hand cells even when the range only covers a few", () => {
    const range: SerializedCombo[] = [{ cards: ["As", "Ah"], weight: 1 }];
    const node: SerializedDecisionNode = {
      type: "decision",
      actor: "P1",
      potBb: 10,
      currentBetToCall: 0,
      actions: [{ action: "check", label: "Check", child: terminal(10) }],
      strategy: [[1]],
    };

    render(<PostflopRangeGrid range={range} node={node} />);
    expect(screen.getAllByTestId("postflop-hand-cell")).toHaveLength(169);
  });

  it("weight-averages per-combo strategy into the canonical hand's cell", () => {
    // Two AA combos (board blocks the other four) with different bet frequencies.
    const range: SerializedCombo[] = [
      { cards: ["As", "Ah"], weight: 1 },
      { cards: ["Ac", "Ad"], weight: 1 },
    ];
    const node: SerializedDecisionNode = {
      type: "decision",
      actor: "P1",
      potBb: 10,
      currentBetToCall: 0,
      actions: [
        { action: "check", label: "Check", child: terminal(10) },
        { action: "bet", label: "Bet 5bb", child: terminal(15) },
      ],
      strategy: [
        [0.2, 0.8],
        [0.4, 0.6],
      ],
    };

    render(<PostflopRangeGrid range={range} node={node} />);
    const aaCell = screen.getAllByTestId("postflop-hand-cell").find((el) => el.getAttribute("data-hand") === "AA");
    expect(aaCell).toBeTruthy();
    // average bet = (0.8*1 + 0.6*1) / 2 = 0.7
    expect(aaCell).toHaveAttribute("title", expect.stringContaining("bet 70.0%"));
  });

  it("marks a hand with no combos in range as not-in-range", () => {
    const range: SerializedCombo[] = [{ cards: ["As", "Ah"], weight: 1 }];
    const node: SerializedDecisionNode = {
      type: "decision",
      actor: "P1",
      potBb: 10,
      currentBetToCall: 0,
      actions: [{ action: "check", label: "Check", child: terminal(10) }],
      strategy: [[1]],
    };

    render(<PostflopRangeGrid range={range} node={node} />);
    const kkCell = screen.getAllByTestId("postflop-hand-cell").find((el) => el.getAttribute("data-hand") === "KK");
    expect(kkCell).toHaveAttribute("title", "KK\nNot in range");
  });

  it("renders the action legend from the node's actual actions", () => {
    const range: SerializedCombo[] = [{ cards: ["As", "Ah"], weight: 1 }];
    const node: SerializedDecisionNode = {
      type: "decision",
      actor: "P1",
      potBb: 10,
      currentBetToCall: 5,
      actions: [
        { action: "fold", label: "Fold", child: terminal(10) },
        { action: "call", label: "Call 5.0bb", child: terminal(20) },
      ],
      strategy: [[0.3, 0.7]],
    };

    render(<PostflopRangeGrid range={range} node={node} />);
    expect(screen.getByText("Fold")).toBeInTheDocument();
    expect(screen.getByText("Call 5.0bb")).toBeInTheDocument();
  });
});
