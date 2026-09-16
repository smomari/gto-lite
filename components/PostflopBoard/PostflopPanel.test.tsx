import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { PostflopPanel } from "./PostflopPanel";
import type {
  CheckdownEquitySummary,
  PostflopResultMessage,
  PostflopSolveRequest,
  SerializedTreeNode,
} from "@/types/postflopSolver";
import type { HandFrequency } from "@/types/rangeData";
import { DEFAULT_PRECISE_SAMPLE_COUNT, sampleNextCards } from "@/lib/postflopSolver/nextCardSampling";

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

function makeCheckdownEquity(overrides: Partial<CheckdownEquitySummary> = {}): CheckdownEquitySummary {
  return { heroEquityPercent: 55, villainEquityPercent: 45, heroEvBb: 0.75, villainEvBb: -0.75, ...overrides };
}

function checkCheckFlopResultWithCheckdown(
  committed: { P1: number; P2: number },
  checkdownEquity: CheckdownEquitySummary,
): PostflopResultMessage {
  const terminal: SerializedTreeNode = { type: "terminal-showdown", potBb: 7.5, committed, checkdownEquity };
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

function checkCheckTurnResult(committed: { P1: number; P2: number }): PostflopResultMessage {
  const terminal: SerializedTreeNode = { type: "terminal-showdown", potBb: 17.5, committed };
  const p2Node: SerializedTreeNode = {
    type: "decision",
    actor: "P2",
    potBb: 17.5,
    currentBetToCall: 0,
    actions: [{ action: "check", label: "Check", child: terminal }],
    strategy: [[1]],
  };
  const tree: SerializedTreeNode = {
    type: "decision",
    actor: "P1",
    potBb: 17.5,
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

function checkCheckRiverResult(committed: { P1: number; P2: number }): PostflopResultMessage {
  const terminal: SerializedTreeNode = { type: "terminal-showdown", potBb: 17.5, committed };
  const p2Node: SerializedTreeNode = {
    type: "decision",
    actor: "P2",
    potBb: 17.5,
    currentBetToCall: 0,
    actions: [{ action: "check", label: "Check", child: terminal }],
    strategy: [[1]],
  };
  const tree: SerializedTreeNode = {
    type: "decision",
    actor: "P1",
    potBb: 17.5,
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

function allinCallTurnResult(effectiveStackBb: number): PostflopResultMessage {
  const terminal: SerializedTreeNode = {
    type: "terminal-showdown",
    potBb: 17.5 + effectiveStackBb * 2,
    committed: { P1: effectiveStackBb, P2: effectiveStackBb },
  };
  const p2Node: SerializedTreeNode = {
    type: "decision",
    actor: "P2",
    potBb: 17.5 + effectiveStackBb,
    currentBetToCall: effectiveStackBb,
    actions: [{ action: "call", label: "Call", child: terminal }],
    strategy: [[1]],
  };
  const tree: SerializedTreeNode = {
    type: "decision",
    actor: "P1",
    potBb: 17.5,
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

  it("once a board is confirmed, the picked cards stay visible next to the street header", () => {
    solvePostflopInWorker.mockReturnValueOnce(new Promise(() => {})); // never resolves — only the "solving" state matters here
    render(<PostflopPanel {...baseProps(20)} />);

    pickFlopBoard();

    const stage = screen.getAllByTestId("street-stage")[0];
    const cardChips = within(stage).getAllByTitle(/^(As|Kd|Qh)$/);
    expect(cardChips.map((el) => el.getAttribute("data-card")).sort()).toEqual(["As", "Kd", "Qh"]);
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

  async function reachTurnCheckCheck() {
    solvePostflopInWorker.mockResolvedValueOnce(checkCheckFlopResult({ P1: 0, P2: 0 }));
    render(<PostflopPanel {...baseProps(20)} />);

    pickFlopBoard();
    await screen.findByRole("button", { name: "Check" });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    fireEvent.click(screen.getByRole("button", { name: "Check" }));

    solvePostflopInWorker.mockResolvedValueOnce(checkCheckTurnResult({ P1: 0, P2: 0 }));
    fireEvent.click(screen.getByRole("button", { name: "7h" }));
    fireEvent.click(screen.getByRole("button", { name: "Solve turn" }));
  }

  it("reaching the turn's own check-check terminal-showdown appends an idle River stage", async () => {
    await reachTurnCheckCheck();

    const turnChecks = await screen.findAllByRole("button", { name: "Check" });
    fireEvent.click(turnChecks[0]); // P1 checks the turn
    fireEvent.click(screen.getByRole("button", { name: "Check" })); // P2 checks, closes the street

    const stages = screen.getAllByTestId("street-stage");
    expect(stages).toHaveLength(3);
    expect(stages[2]).toHaveAttribute("data-street", "River");
    expect(within(stages[2]).getByText(/Pick the river card/)).toBeInTheDocument();
    expect(within(stages[1]).getByText(/river card coming next/)).toBeInTheDocument();
  });

  it("solving the river sends a combos-kind request derived from the turn's path", async () => {
    await reachTurnCheckCheck();
    const turnChecks = await screen.findAllByRole("button", { name: "Check" });
    fireEvent.click(turnChecks[0]);
    fireEvent.click(screen.getByRole("button", { name: "Check" }));

    solvePostflopInWorker.mockResolvedValueOnce(checkCheckRiverResult({ P1: 0, P2: 0 }));
    fireEvent.click(screen.getByRole("button", { name: "2h" }));
    fireEvent.click(screen.getByRole("button", { name: "Solve river" }));
    await screen.findByRole("button", { name: "Pick a different river card" });

    const riverRequest = solvePostflopInWorker.mock.calls[2][0] as PostflopSolveRequest;
    expect(riverRequest.kind).toBe("combos");
    if (riverRequest.kind === "combos") {
      expect(riverRequest.board).toEqual(["As", "Kd", "Qh", "7h", "2h"]);
      expect(riverRequest.heroRange).toEqual([{ cards: ["Ah", "Kd"], weight: 1 }]);
      expect(riverRequest.villainRange).toEqual([{ cards: ["7c", "2c"], weight: 1 }]);
    }
  });

  it("reaching the river's own terminal-showdown does not add a further stage, and shows a final-showdown message", async () => {
    await reachTurnCheckCheck();
    const turnChecks = await screen.findAllByRole("button", { name: "Check" });
    fireEvent.click(turnChecks[0]);
    fireEvent.click(screen.getByRole("button", { name: "Check" }));

    solvePostflopInWorker.mockResolvedValueOnce(checkCheckRiverResult({ P1: 0, P2: 0 }));
    fireEvent.click(screen.getByRole("button", { name: "2h" }));
    fireEvent.click(screen.getByRole("button", { name: "Solve river" }));

    const riverChecks = await screen.findAllByRole("button", { name: "Check" });
    fireEvent.click(riverChecks[0]);
    fireEvent.click(screen.getByRole("button", { name: "Check" }));

    const stages = screen.getAllByTestId("street-stage");
    expect(stages).toHaveLength(3);
    expect(within(stages[2]).getByText(/Showdown/)).toBeInTheDocument();
  });

  it("an all-in-call terminal on the turn (no stack left) does not offer a river stage (regression)", async () => {
    solvePostflopInWorker.mockResolvedValueOnce(checkCheckFlopResult({ P1: 0, P2: 0 }));
    render(<PostflopPanel {...baseProps(20)} />);

    pickFlopBoard();
    await screen.findByRole("button", { name: "Check" });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    fireEvent.click(screen.getByRole("button", { name: "Check" }));

    solvePostflopInWorker.mockResolvedValueOnce(allinCallTurnResult(20));
    fireEvent.click(screen.getByRole("button", { name: "7h" }));
    fireEvent.click(screen.getByRole("button", { name: "Solve turn" }));

    await screen.findByRole("button", { name: "Allin 20.0bb" });
    fireEvent.click(screen.getByRole("button", { name: "Allin 20.0bb" }));
    fireEvent.click(screen.getByRole("button", { name: "Call" }));

    const stages = screen.getAllByTestId("street-stage");
    expect(stages).toHaveLength(2);
    expect(within(stages[1]).getByText(/All-in — hand is already decided/)).toBeInTheDocument();
    expect(screen.queryByText(/isn't implemented yet/)).not.toBeInTheDocument();
  });

  function sampleResult(heroEvBb: number, villainEvBb: number): PostflopResultMessage {
    const tree: SerializedTreeNode = { type: "terminal-showdown", potBb: 7.5, committed: { P1: 0, P2: 0 } };
    return {
      type: "result",
      tree,
      heroRange: [{ cards: ["Ah", "Kd"], weight: 1 }],
      villainRange: [{ cards: ["7c", "2c"], weight: 1 }],
      iterations: 50,
      exploitability: {
        bb: 0,
        percentOfPot: 0,
        p1BestResponseBb: heroEvBb,
        p2BestResponseBb: villainEvBb,
        p1ActualBb: heroEvBb,
        p2ActualBb: villainEvBb,
      },
    };
  }

  async function reachFlopCheckCheckWithCheckdown() {
    solvePostflopInWorker.mockResolvedValueOnce(
      checkCheckFlopResultWithCheckdown({ P1: 0, P2: 0 }, makeCheckdownEquity()),
    );
    render(<PostflopPanel {...baseProps(20)} />);

    pickFlopBoard();
    await screen.findByRole("button", { name: "Check" });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    await screen.findByText(/Checkdown avg EV/);
  }

  it("shows the checkdown equity note and a compute-precise-average button at a terminal-showdown with a next street", async () => {
    await reachFlopCheckCheckWithCheckdown();
    expect(screen.getByText(/Checkdown avg EV.*BTN 55\.0% \/ \+0\.75bb.*BB 45\.0% \/ -0\.75bb/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Compute precise average EV/ })).toBeInTheDocument();
  });

  it("clicking compute-precise-average solves DEFAULT_PRECISE_SAMPLE_COUNT sampled turn cards as combos requests and averages the result", async () => {
    await reachFlopCheckCheckWithCheckdown();

    const expectedCards = sampleNextCards(["As", "Kd", "Qh"], DEFAULT_PRECISE_SAMPLE_COUNT);
    for (let i = 0; i < expectedCards.length; i++) {
      solvePostflopInWorker.mockResolvedValueOnce(sampleResult(1 + i, -(1 + i)));
    }

    fireEvent.click(screen.getByRole("button", { name: /Compute precise average EV/ }));

    await waitFor(() => expect(screen.getByText(/Average:/)).toBeInTheDocument());

    // 1 flop call + N sample calls, all kind:"combos" for the samples, boards = flop + sampled card.
    expect(solvePostflopInWorker).toHaveBeenCalledTimes(1 + expectedCards.length);
    for (let i = 0; i < expectedCards.length; i++) {
      const req = solvePostflopInWorker.mock.calls[1 + i][0] as PostflopSolveRequest;
      expect(req.kind).toBe("combos");
      if (req.kind === "combos") expect(req.board).toEqual(["As", "Kd", "Qh", expectedCards[i]]);
    }

    const avgHero = expectedCards.reduce((s, _c, i) => s + (1 + i), 0) / expectedCards.length;
    expect(screen.getByText(new RegExp(`Average:.*BTN \\+${avgHero.toFixed(2)}bb`))).toBeInTheDocument();
  });

  it("cancelling a precise-average computation mid-flight aborts and returns to the idle button", async () => {
    await reachFlopCheckCheckWithCheckdown();

    let rejectFirst: (err: unknown) => void = () => {};
    solvePostflopInWorker.mockImplementationOnce(
      (_req: PostflopSolveRequest, options?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          rejectFirst = reject;
          options?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    );

    fireEvent.click(screen.getByRole("button", { name: /Compute precise average EV/ }));
    await screen.findByRole("button", { name: "Cancel" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    void rejectFirst; // silence unused-var lint if the abort listener path is what actually rejects

    await waitFor(() => expect(screen.getByRole("button", { name: /Compute precise average EV/ })).toBeInTheDocument());
  });

  it("picking a different turn card clears a completed precise-average result for that stage", async () => {
    await reachFlopCheckCheckWithCheckdown();
    const expectedCards = sampleNextCards(["As", "Kd", "Qh"], DEFAULT_PRECISE_SAMPLE_COUNT);
    for (let i = 0; i < expectedCards.length; i++) solvePostflopInWorker.mockResolvedValueOnce(sampleResult(1, -1));
    fireEvent.click(screen.getByRole("button", { name: /Compute precise average EV/ }));
    await waitFor(() => expect(screen.getByText(/Average:/)).toBeInTheDocument());

    solvePostflopInWorker.mockResolvedValueOnce(turnResult());
    fireEvent.click(screen.getByRole("button", { name: "7h" }));
    fireEvent.click(screen.getByRole("button", { name: "Solve turn" }));
    await screen.findByRole("button", { name: "Pick a different turn card" });

    fireEvent.click(screen.getByRole("button", { name: "Pick a different turn card" }));
    solvePostflopInWorker.mockResolvedValueOnce(
      checkCheckFlopResultWithCheckdown({ P1: 0, P2: 0 }, makeCheckdownEquity()),
    );
    // Re-picking the flop stage's own checkdown note is still on-screen (stage 0);
    // the new turn stage should be back to its idle board picker, not a stale "Average:" result.
    const stages = screen.getAllByTestId("street-stage");
    expect(within(stages[1]).queryByText(/Average:/)).not.toBeInTheDocument();
  });
});
