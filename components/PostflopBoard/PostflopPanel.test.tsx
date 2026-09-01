import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { PostflopPanel } from "./PostflopPanel";
import type { PostflopResultMessage, PostflopSolveRequest, SerializedTreeNode } from "@/types/postflopSolver";
import type { HandFrequency } from "@/types/rangeData";

const { solvePostflopInWorker } = vi.hoisted(() => ({ solvePostflopInWorker: vi.fn() }));
vi.mock("@/lib/postflopSolver/worker/workerClient", () => ({ solvePostflopInWorker }));

const HANDS: HandFrequency[] = [{ hand: "AA", fold: 0, call: 1, raise: 0 }];

function checkCheckFlopResult(committed: { P1: number; P2: number }): PostflopResultMessage {
  const terminal: SerializedTreeNode = { type: "terminal-showdown", potBb: 7.5, committed };
  const p2Node: SerializedTreeNode = {
    type: "decision",
    actor: "P2",
    potBb: 7.5,
    currentBetToCall: 0,
    actions: [{ action: "check", label: "Check", child: terminal }],
    strategy: [[1]],
  };
  const tree: SerializedTreeNode = {
    type: "decision",
    actor: "P1",
    potBb: 7.5,
    currentBetToCall: 0,
    actions: [{ action: "check", label: "Check", child: p2Node }],
    strategy: [[1]],
  };
  return {
    type: "result",
    tree,
    heroRange: [{ cards: ["Ah", "Kd"], weight: 1 }],
    villainRange: [{ cards: ["7c", "2c"], weight: 1 }],
    iterations: 100,
  };
}

function allinCallFlopResult(effectiveStackBb: number): PostflopResultMessage {
  const terminal: SerializedTreeNode = {
    type: "terminal-showdown",
    potBb: 7.5 + effectiveStackBb * 2,
    committed: { P1: effectiveStackBb, P2: effectiveStackBb },
  };
  const p2Node: SerializedTreeNode = {
    type: "decision",
    actor: "P2",
    potBb: 7.5 + effectiveStackBb,
    currentBetToCall: effectiveStackBb,
    actions: [{ action: "call", label: "Call", child: terminal }],
    strategy: [[1]],
  };
  const tree: SerializedTreeNode = {
    type: "decision",
    actor: "P1",
    potBb: 7.5,
    currentBetToCall: 0,
    actions: [{ action: "allin", label: `Allin ${effectiveStackBb.toFixed(1)}bb`, child: p2Node }],
    strategy: [[1]],
  };
  return {
    type: "result",
    tree,
    heroRange: [{ cards: ["Ah", "Kd"], weight: 1 }],
    villainRange: [{ cards: ["7c", "2c"], weight: 1 }],
    iterations: 100,
  };
}

function turnResult(): PostflopResultMessage {
  const tree: SerializedTreeNode = {
    type: "decision",
    actor: "P1",
    potBb: 7.5,
    currentBetToCall: 0,
    actions: [{ action: "check", label: "Check", child: { type: "terminal-showdown", potBb: 7.5, committed: { P1: 0, P2: 0 } } }],
    strategy: [[1]],
  };
  return {
    type: "result",
    tree,
    heroRange: [{ cards: ["Ah", "Kd"], weight: 1 }],
    villainRange: [{ cards: ["7c", "2c"], weight: 1 }],
    iterations: 100,
  };
}

function baseProps(effectiveStackBb: number) {
  return {
    heroLabel: "BTN",
    heroHands: HANDS,
    heroActionKey: "call" as const,
    villainLabel: "BB",
    villainHands: HANDS,
    villainActionKey: "call" as const,
    startPot: 7.5,
    effectiveStackBb,
  };
}

function pickFlopBoard() {
  fireEvent.click(screen.getByRole("button", { name: "As" }));
  fireEvent.click(screen.getByRole("button", { name: "Kd" }));
  fireEvent.click(screen.getByRole("button", { name: "Qh" }));
  fireEvent.click(screen.getByRole("button", { name: "Solve flop" }));
}

beforeEach(() => {
  solvePostflopInWorker.mockReset();
});

describe("PostflopPanel", () => {
  it("starts with a single Flop stage showing the 3-card board picker", () => {
    render(<PostflopPanel {...baseProps(20)} />);
    const stages = screen.getAllByTestId("street-stage");
    expect(stages).toHaveLength(1);
    expect(stages[0]).toHaveAttribute("data-street", "Flop");
    expect(within(stages[0]).getByText(/Pick the 3 flop cards/)).toBeInTheDocument();
  });

  it("reaching a check-check terminal-showdown (stack still behind) appends an idle Turn stage", async () => {
    solvePostflopInWorker.mockResolvedValueOnce(checkCheckFlopResult({ P1: 0, P2: 0 }));
    render(<PostflopPanel {...baseProps(20)} />);

    pickFlopBoard();
    await screen.findByRole("button", { name: "Check" }); // P1's active box rendered
    fireEvent.click(screen.getByRole("button", { name: "Check" })); // P1 checks
    fireEvent.click(screen.getByRole("button", { name: "Check" })); // P2 checks, closes street

    const stages = screen.getAllByTestId("street-stage");
    expect(stages).toHaveLength(2);
    expect(stages[1]).toHaveAttribute("data-street", "Turn");
    expect(within(stages[1]).getByText(/Pick the turn card/)).toBeInTheDocument();

    const flopRequest = solvePostflopInWorker.mock.calls[0][0] as PostflopSolveRequest;
    expect(flopRequest.kind).toBe("canonical");
    expect(within(stages[0]).getByText(/turn card coming next/)).toBeInTheDocument();
  });

  it("solving the turn sends a combos-kind request derived from the flop's path, and renders the turn's own action bar", async () => {
    solvePostflopInWorker.mockResolvedValueOnce(checkCheckFlopResult({ P1: 0, P2: 0 }));
    render(<PostflopPanel {...baseProps(20)} />);

    pickFlopBoard();
    await screen.findByRole("button", { name: "Check" });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    fireEvent.click(screen.getByRole("button", { name: "Check" }));

    solvePostflopInWorker.mockResolvedValueOnce(turnResult());
    fireEvent.click(screen.getByRole("button", { name: "7h" }));
    fireEvent.click(screen.getByRole("button", { name: "Solve turn" }));

    await screen.findByRole("button", { name: "Pick a different turn card" });

    const turnRequest = solvePostflopInWorker.mock.calls[1][0] as PostflopSolveRequest;
    expect(turnRequest.kind).toBe("combos");
    if (turnRequest.kind === "combos") {
      expect(turnRequest.board).toEqual(["As", "Kd", "Qh", "7h"]);
      expect(turnRequest.heroRange).toEqual([{ cards: ["Ah", "Kd"], weight: 1 }]);
    }

    const stages = screen.getAllByTestId("street-stage");
    expect(within(stages[1]).getByRole("button", { name: "Check" })).toBeInTheDocument();
  });

  it("'Pick a different turn card' resets only the turn stage, leaving the flop's result intact", async () => {
    solvePostflopInWorker.mockResolvedValueOnce(checkCheckFlopResult({ P1: 0, P2: 0 }));
    render(<PostflopPanel {...baseProps(20)} />);

    pickFlopBoard();
    await screen.findByRole("button", { name: "Check" });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    fireEvent.click(screen.getByRole("button", { name: "Check" }));

    solvePostflopInWorker.mockResolvedValueOnce(turnResult());
    fireEvent.click(screen.getByRole("button", { name: "7h" }));
    fireEvent.click(screen.getByRole("button", { name: "Solve turn" }));
    await screen.findByRole("button", { name: "Pick a different turn card" });

    fireEvent.click(screen.getByRole("button", { name: "Pick a different turn card" }));

    const stages = screen.getAllByTestId("street-stage");
    expect(stages).toHaveLength(2);
    expect(within(stages[1]).getByText(/Pick the turn card/)).toBeInTheDocument();
    // Flop stage is untouched — still shows its frozen history, not the board picker.
    expect(within(stages[0]).queryByText(/Pick the 3 flop cards/)).not.toBeInTheDocument();
  });

  it("an all-in-call terminal (no stack left) does not offer a turn stage", async () => {
    solvePostflopInWorker.mockResolvedValueOnce(allinCallFlopResult(10));
    render(<PostflopPanel {...baseProps(10)} />);

    pickFlopBoard();
    await screen.findByRole("button", { name: "Allin 10.0bb" });
    fireEvent.click(screen.getByRole("button", { name: "Allin 10.0bb" }));
    fireEvent.click(screen.getByRole("button", { name: "Call" }));

    const stages = screen.getAllByTestId("street-stage");
    expect(stages).toHaveLength(1);
    expect(screen.getByText(/All-in — hand is already decided/)).toBeInTheDocument();
  });
});
