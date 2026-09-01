import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PostflopActionBar } from "./PostflopActionBar";
import type { SerializedDecisionAction, SerializedTreeNode } from "@/types/postflopSolver";

function decisionNode(actor: "P1" | "P2", actions: SerializedDecisionAction[]): SerializedTreeNode {
  return { type: "decision", actor, potBb: 10, currentBetToCall: 0, actions, strategy: [] };
}

const terminalShowdown: SerializedTreeNode = {
  type: "terminal-showdown",
  potBb: 10,
  committed: { P1: 0, P2: 0 },
};
const noop = () => {};

describe("PostflopActionBar", () => {
  it("empty history: renders exactly one active box, no history boxes, buttons fire onNavigate with the right action", () => {
    const checkAction: SerializedDecisionAction = { action: "check", label: "Check", child: terminalShowdown };
    const onNavigate = vi.fn();
    render(
      <PostflopActionBar
        node={decisionNode("P1", [checkAction])}
        history={[]}
        heroLabel="BTN"
        villainLabel="BB"
        onNavigate={onNavigate}
      />,
    );

    const boxes = screen.getAllByTestId("postflop-seat-box");
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toHaveAttribute("data-kind", "active");
    expect(boxes[0]).toHaveAttribute("data-seat", "BTN");

    boxes[0].querySelector("button")?.click();
    expect(onNavigate).toHaveBeenCalledWith(checkAction);
  });

  it("after 2 navigations: 2 non-interactive history boxes in order, then 1 active box for whoever's turn it now is", () => {
    render(
      <PostflopActionBar
        node={decisionNode("P1", [{ action: "check", label: "Check", child: terminalShowdown }])}
        history={[
          { actor: "P1", label: "Check" },
          { actor: "P2", label: "Bet 5.0bb" },
        ]}
        heroLabel="BTN"
        villainLabel="BB"
        onNavigate={noop}
      />,
    );

    const boxes = screen.getAllByTestId("postflop-seat-box");
    expect(boxes).toHaveLength(3);

    expect(boxes[0]).toHaveAttribute("data-kind", "history");
    expect(boxes[0]).toHaveAttribute("data-seat", "BTN");
    expect(boxes[0]).toHaveTextContent("Check");

    expect(boxes[1]).toHaveAttribute("data-kind", "history");
    expect(boxes[1]).toHaveAttribute("data-seat", "BB");
    expect(boxes[1]).toHaveTextContent("Bet 5.0bb");

    expect(boxes[2]).toHaveAttribute("data-kind", "active");
    expect(boxes[2]).toHaveAttribute("data-seat", "BTN");

    expect(boxes[0].querySelector("button")).toBeNull();
    expect(boxes[1].querySelector("button")).toBeNull();
  });

  it("terminal node: renders the plain-text message and zero active box", () => {
    render(
      <PostflopActionBar
        node={{ type: "terminal-fold", potBb: 12, winner: "P2", committed: { P1: 0, P2: 0 } }}
        history={[{ actor: "P1", label: "Fold" }]}
        heroLabel="BTN"
        villainLabel="BB"
        onNavigate={noop}
      />,
    );

    expect(
      screen.getAllByTestId("postflop-seat-box").filter((b) => b.getAttribute("data-kind") === "active"),
    ).toHaveLength(0);
    expect(screen.getByText(/wins uncontested/)).toBeInTheDocument();
  });

  it("terminal-showdown: shows the default 'runs out to the river' message when no override is given", () => {
    render(
      <PostflopActionBar
        node={terminalShowdown}
        history={[]}
        heroLabel="BTN"
        villainLabel="BB"
        onNavigate={noop}
      />,
    );

    expect(screen.getByText(/runs out to the river/)).toBeInTheDocument();
  });

  it("terminal-showdown: uses terminalShowdownMessage when given, instead of the default", () => {
    render(
      <PostflopActionBar
        node={terminalShowdown}
        history={[]}
        heroLabel="BTN"
        villainLabel="BB"
        onNavigate={noop}
        terminalShowdownMessage={(potBb) => `Custom message, pot ${potBb.toFixed(1)}bb`}
      />,
    );

    expect(screen.getByText("Custom message, pot 10.0bb")).toBeInTheDocument();
    expect(screen.queryByText(/runs out to the river/)).not.toBeInTheDocument();
  });
});
