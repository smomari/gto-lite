import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PostflopRangeGrid } from "./PostflopRangeGrid";
import type { SerializedCombo, SerializedDecisionNode } from "@/types/postflopSolver";
import { buildActionColorScale } from "./postflopColorLegend";

function terminal(potBb: number): SerializedDecisionNode["actions"][number]["child"] {
  return { type: "terminal-showdown", potBb, committed: { P1: 0, P2: 0 } };
}

function noopSelect() {}

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

    render(
      <PostflopRangeGrid
        range={range}
        node={node}
        colors={buildActionColorScale(node.actions)}
        isolatedActionIndex={null}
        selectedHand={null}
        onSelectHand={noopSelect}
      />,
    );
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

    render(
      <PostflopRangeGrid
        range={range}
        node={node}
        colors={buildActionColorScale(node.actions)}
        isolatedActionIndex={null}
        selectedHand={null}
        onSelectHand={noopSelect}
      />,
    );
    const aaCell = screen.getAllByTestId("postflop-hand-cell").find((el) => el.getAttribute("data-hand") === "AA");
    expect(aaCell).toBeTruthy();
    // average bet = (0.8*1 + 0.6*1) / 2 = 0.7
    expect(aaCell).toHaveAttribute("title", expect.stringContaining("Bet 5bb 70.0%"));
  });

  it("preserves each bet size's own frequency instead of merging them (regression guard)", () => {
    // One combo, two different bet sizes at different frequencies — must not collapse into one "bet" bucket.
    const range: SerializedCombo[] = [{ cards: ["As", "Ah"], weight: 1 }];
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
      strategy: [[0.1, 0.2, 0.7]],
    };

    render(
      <PostflopRangeGrid
        range={range}
        node={node}
        colors={buildActionColorScale(node.actions)}
        isolatedActionIndex={null}
        selectedHand={null}
        onSelectHand={noopSelect}
      />,
    );
    const aaCell = screen.getAllByTestId("postflop-hand-cell").find((el) => el.getAttribute("data-hand") === "AA")!;
    expect(aaCell).toHaveAttribute("title", expect.stringContaining("Bet 33% 20.0%"));
    expect(aaCell).toHaveAttribute("title", expect.stringContaining("Bet 66% 70.0%"));
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

    render(
      <PostflopRangeGrid
        range={range}
        node={node}
        colors={buildActionColorScale(node.actions)}
        isolatedActionIndex={null}
        selectedHand={null}
        onSelectHand={noopSelect}
      />,
    );
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

    render(
      <PostflopRangeGrid
        range={range}
        node={node}
        colors={buildActionColorScale(node.actions)}
        isolatedActionIndex={null}
        selectedHand={null}
        onSelectHand={noopSelect}
      />,
    );
    expect(screen.getByText("Fold")).toBeInTheDocument();
    expect(screen.getByText("Call 5.0bb")).toBeInTheDocument();
  });

  it("isolate mode shows only the isolated action's fill for a cell", () => {
    const range: SerializedCombo[] = [{ cards: ["As", "Ah"], weight: 1 }];
    const node: SerializedDecisionNode = {
      type: "decision",
      actor: "P1",
      potBb: 10,
      currentBetToCall: 0,
      actions: [
        { action: "check", label: "Check", child: terminal(10) },
        { action: "bet", label: "Bet 5bb", child: terminal(15) },
      ],
      strategy: [[0.3, 0.7]],
    };

    render(
      <PostflopRangeGrid
        range={range}
        node={node}
        colors={buildActionColorScale(node.actions)}
        isolatedActionIndex={1}
        selectedHand={null}
        onSelectHand={noopSelect}
      />,
    );
    const aaCell = screen.getAllByTestId("postflop-hand-cell").find((el) => el.getAttribute("data-hand") === "AA")!;
    const fill = aaCell.querySelector('[data-testid="postflop-hand-cell-isolated-fill"]') as HTMLElement;
    expect(fill).toBeTruthy();
    expect(fill.style.opacity).toBe("0.7");
  });

  it("clicking a hand cell selects it, clicking again deselects it", () => {
    const range: SerializedCombo[] = [{ cards: ["As", "Ah"], weight: 1 }];
    const node: SerializedDecisionNode = {
      type: "decision",
      actor: "P1",
      potBb: 10,
      currentBetToCall: 0,
      actions: [{ action: "check", label: "Check", child: terminal(10) }],
      strategy: [[1]],
    };
    const onSelectHand = vi.fn();

    const { rerender } = render(
      <PostflopRangeGrid
        range={range}
        node={node}
        colors={buildActionColorScale(node.actions)}
        isolatedActionIndex={null}
        selectedHand={null}
        onSelectHand={onSelectHand}
      />,
    );
    const aaCell = screen.getAllByTestId("postflop-hand-cell").find((el) => el.getAttribute("data-hand") === "AA")!;
    fireEvent.click(aaCell);
    expect(onSelectHand).toHaveBeenCalledWith("AA");

    rerender(
      <PostflopRangeGrid
        range={range}
        node={node}
        colors={buildActionColorScale(node.actions)}
        isolatedActionIndex={null}
        selectedHand="AA"
        onSelectHand={onSelectHand}
      />,
    );
    fireEvent.click(aaCell);
    expect(onSelectHand).toHaveBeenLastCalledWith(null);
  });

  it("a not-in-range cell cannot be clicked/selected", () => {
    const range: SerializedCombo[] = [{ cards: ["As", "Ah"], weight: 1 }];
    const node: SerializedDecisionNode = {
      type: "decision",
      actor: "P1",
      potBb: 10,
      currentBetToCall: 0,
      actions: [{ action: "check", label: "Check", child: terminal(10) }],
      strategy: [[1]],
    };
    const onSelectHand = vi.fn();

    render(
      <PostflopRangeGrid
        range={range}
        node={node}
        colors={buildActionColorScale(node.actions)}
        isolatedActionIndex={null}
        selectedHand={null}
        onSelectHand={onSelectHand}
      />,
    );
    const kkCell = screen.getAllByTestId("postflop-hand-cell").find((el) => el.getAttribute("data-hand") === "KK")!;
    expect(kkCell).toBeDisabled();
    fireEvent.click(kkCell);
    expect(onSelectHand).not.toHaveBeenCalled();
  });
});
