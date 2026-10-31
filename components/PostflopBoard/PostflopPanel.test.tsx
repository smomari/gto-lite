import { describe, expect, it, vi, beforeEach } from "vitest";
import { useState, type ComponentProps } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

/** A turn solved looking ahead to the river (C++ engine): check-check ends in a chance node carrying the lookahead's EV. */
function turnLookaheadResult(): PostflopResultMessage {
  const chance: SerializedTreeNode = {
    type: "chance",
    potBb: 7.5,
    committed: { P1: 0, P2: 0 },
    nextStreetEv: { heroEvBb: 1.5, villainEvBb: 6 },
  };
  const p2Node: SerializedTreeNode = {
    type: "decision",
    actor: "P2",
    potBb: 7.5,
    currentBetToCall: 0,
    actions: [{ action: "check", label: "Check", child: chance }],
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
    iterations: 300,
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

/** Mirrors the page: a seat-bar slot the panel portals its street boxes into. */
function Harness(props: Omit<ComponentProps<typeof PostflopPanel>, "streetBarSlot">) {
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  return (
    <>
      <div data-testid="street-bar-slot" ref={setSlot} />
      <PostflopPanel {...props} streetBarSlot={slot} />
    </>
  );
}

function renderPanel(effectiveStackBb: number) {
  return render(<Harness {...baseProps(effectiveStackBb)} />);
}

function liveStage() {
  return screen.getByTestId("street-stage");
}

/** [street, status] for every street box in the seat bar, in order. */
function streetBoxSummary() {
  return screen.queryAllByTestId("street-box").map((b) => [b.getAttribute("data-street"), b.getAttribute("data-status")]);
}

/** The seat-bar slot's entries in order: street boxes by label, seat boxes as "SEAT:label" (or "SEAT:active"). */
function timeline() {
  return [...screen.getByTestId("street-bar-slot").children].map((el) => {
    const element = el as HTMLElement;
    if (element.dataset.testid === "street-box") return element.dataset.street;
    const seat = element.dataset.seat;
    return element.dataset.kind === "active" ? `${seat}:active` : `${seat}:${element.textContent?.replace(seat ?? "", "")}`;
  });
}

function streetBox(label: string) {
  return screen.getAllByTestId("street-box").find((b) => b.getAttribute("data-street") === label)!;
}

function openStreetDetails(label: string) {
  fireEvent.click(streetBox(label));
  return screen.getByTestId("past-street-details");
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
  it("starts with a single live Flop stage showing the 3-card board picker, and no street boxes yet", () => {
    renderPanel(20);
    expect(screen.getAllByTestId("street-stage")).toHaveLength(1);
    expect(liveStage()).toHaveAttribute("data-street", "Flop");
    expect(within(liveStage()).getByText(/Pick the 3 flop cards/)).toBeInTheDocument();
    expect(streetBoxSummary()).toEqual([]);
  });

  it("a flop solve is plain by default, precise when ticked, and only the flop offers it", async () => {
    solvePostflopInWorker.mockResolvedValue(new Promise(() => {}));
    renderPanel(20);
    const precise = within(liveStage()).getByRole("checkbox", { name: /Precise flop/ });
    expect(precise).not.toBeChecked();

    fireEvent.click(precise);
    pickFlopBoard();

    expect(solvePostflopInWorker.mock.calls[0][0]).toMatchObject({ kind: "canonical", precise: true });
    expect(screen.queryByRole("checkbox", { name: /Precise flop/ })).not.toBeInTheDocument();
  });

  it("a failed solve can be left: the error offers picking a different board, back to the board picker", async () => {
    solvePostflopInWorker.mockRejectedValueOnce(new Error("solve failed"));
    renderPanel(20);

    pickFlopBoard();

    expect(await within(liveStage()).findByText("Error: solve failed")).toBeInTheDocument();
    fireEvent.click(within(liveStage()).getByRole("button", { name: "Pick a different board" }));

    expect(within(liveStage()).getByText(/Pick the 3 flop cards/)).toBeInTheDocument();
    expect(streetBoxSummary()).toEqual([]);
  });

  it("once a board is confirmed, a live Flop box with the picked cards appears in the seat-bar slot, not in the panel", () => {
    solvePostflopInWorker.mockReturnValueOnce(new Promise(() => {})); // never resolves — only the "solving" state matters here
    renderPanel(20);

    pickFlopBoard();

    expect(streetBoxSummary()).toEqual([["Flop", "live"]]);
    const slot = screen.getByTestId("street-bar-slot");
    const cardChips = within(slot).getAllByTitle(/^(As|Kd|Qh)$/);
    expect(cardChips.map((el) => el.getAttribute("data-card")).sort()).toEqual(["As", "Kd", "Qh"]);
    expect(within(liveStage()).queryByTestId("street-box")).not.toBeInTheDocument();
  });

  it("reaching a check-check terminal-showdown (stack still behind) turns the flop into a past box and makes an idle Turn the live stage", async () => {
    solvePostflopInWorker.mockResolvedValueOnce(checkCheckFlopResult({ P1: 0, P2: 0 }));
    renderPanel(20);

    pickFlopBoard();
    await screen.findByRole("button", { name: "Check" }); // P1's active box rendered
    fireEvent.click(screen.getByRole("button", { name: "Check" })); // P1 checks
    fireEvent.click(screen.getByRole("button", { name: "Check" })); // P2 checks, closes street

    expect(screen.getAllByTestId("street-stage")).toHaveLength(1);
    expect(liveStage()).toHaveAttribute("data-street", "Turn");
    expect(within(liveStage()).getByText(/Pick the turn card/)).toBeInTheDocument();
    expect(streetBoxSummary()).toEqual([["Flop", "past"]]);

    const flopRequest = solvePostflopInWorker.mock.calls[0][0] as PostflopSolveRequest;
    expect(flopRequest.kind).toBe("canonical");
    expect(within(openStreetDetails("Flop")).getByText(/turn card coming next/)).toBeInTheDocument();
  });

  it("solving the turn sends a combos-kind request derived from the flop's path, and renders the turn's own action bar", async () => {
    solvePostflopInWorker.mockResolvedValueOnce(checkCheckFlopResult({ P1: 0, P2: 0 }));
    renderPanel(20);

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

    // The turn's own to-act box sits in the seat bar right after the Turn box, not in the panel body.
    expect(timeline()).toEqual(["Flop", "BTN:Check", "BB:Check", "Turn", "BTN:active"]);
    expect(within(liveStage()).queryByTestId("postflop-seat-box")).not.toBeInTheDocument();
    expect(streetBoxSummary()).toEqual([
      ["Flop", "past"],
      ["Turn", "live"],
    ]);
    // The turn box carries only the turn card, plus the pot entering the street.
    const turnBox = streetBox("Turn");
    expect([...turnBox.querySelectorAll("[data-card]")].map((el) => el.getAttribute("data-card"))).toEqual(["7h"]);
    expect(within(turnBox).getByText("pot 7.5bb")).toBeInTheDocument();
  });

  it("'Pick a different turn card' resets only the turn stage, leaving the flop's result intact", async () => {
    solvePostflopInWorker.mockResolvedValueOnce(checkCheckFlopResult({ P1: 0, P2: 0 }));
    renderPanel(20);

    pickFlopBoard();
    await screen.findByRole("button", { name: "Check" });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    fireEvent.click(screen.getByRole("button", { name: "Check" }));

    solvePostflopInWorker.mockResolvedValueOnce(turnResult());
    fireEvent.click(screen.getByRole("button", { name: "7h" }));
    fireEvent.click(screen.getByRole("button", { name: "Solve turn" }));
    await screen.findByRole("button", { name: "Pick a different turn card" });

    fireEvent.click(screen.getByRole("button", { name: "Pick a different turn card" }));

    expect(liveStage()).toHaveAttribute("data-street", "Turn");
    expect(within(liveStage()).getByText(/Pick the turn card/)).toBeInTheDocument();
    // The flop is untouched — still a past box, not back at its board picker.
    expect(streetBoxSummary()).toEqual([["Flop", "past"]]);
    expect(screen.queryByText(/Pick the 3 flop cards/)).not.toBeInTheDocument();
  });

  it("an all-in-call terminal (no stack left) does not offer a turn stage", async () => {
    solvePostflopInWorker.mockResolvedValueOnce(allinCallFlopResult(10));
    renderPanel(10);

    pickFlopBoard();
    await screen.findByRole("button", { name: "Allin 10.0bb" });
    fireEvent.click(screen.getByRole("button", { name: "Allin 10.0bb" }));
    fireEvent.click(screen.getByRole("button", { name: "Call" }));

    expect(liveStage()).toHaveAttribute("data-street", "Flop");
    expect(streetBoxSummary()).toEqual([["Flop", "live"]]);
    expect(screen.getByText(/All-in — hand is already decided/)).toBeInTheDocument();
  });

  async function reachTurnCheckCheck() {
    solvePostflopInWorker.mockResolvedValueOnce(checkCheckFlopResult({ P1: 0, P2: 0 }));
    renderPanel(20);

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

    expect(liveStage()).toHaveAttribute("data-street", "River");
    expect(within(liveStage()).getByText(/Pick the river card/)).toBeInTheDocument();
    expect(streetBoxSummary()).toEqual([
      ["Flop", "past"],
      ["Turn", "past"],
    ]);
    expect(within(openStreetDetails("Turn")).getByText(/river card coming next/)).toBeInTheDocument();
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

    expect(liveStage()).toHaveAttribute("data-street", "River");
    expect(within(liveStage()).getByText(/Showdown/)).toBeInTheDocument();
    expect(streetBoxSummary()).toEqual([
      ["Flop", "past"],
      ["Turn", "past"],
      ["River", "live"],
    ]);
  });

  it("an all-in-call terminal on the turn (no stack left) does not offer a river stage (regression)", async () => {
    solvePostflopInWorker.mockResolvedValueOnce(checkCheckFlopResult({ P1: 0, P2: 0 }));
    renderPanel(20);

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

    expect(liveStage()).toHaveAttribute("data-street", "Turn");
    expect(within(liveStage()).getByText(/All-in — hand is already decided/)).toBeInTheDocument();
    expect(streetBoxSummary()).toEqual([
      ["Flop", "past"],
      ["Turn", "live"],
    ]);
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
    renderPanel(20);

    pickFlopBoard();
    await screen.findByRole("button", { name: "Check" });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    // The flop closes to a terminal-showdown with a next street live, so a new
    // idle Turn stage goes live and the flop becomes a past box — open its
    // details to reach the checkdown note / precise-EV button.
    openStreetDetails("Flop");
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
    // The new turn stage is back to its idle board picker, not a stale "Average:" result.
    expect(within(liveStage()).queryByText(/Average:/)).not.toBeInTheDocument();
  });

  it("a past street is a compact box (street, cards, pot) followed by its seat boxes; its full details only open on demand, over the live stage", async () => {
    solvePostflopInWorker.mockResolvedValueOnce(checkCheckFlopResult({ P1: 0, P2: 0 }));
    renderPanel(20);

    pickFlopBoard();
    await screen.findByRole("button", { name: "Check" });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    fireEvent.click(screen.getByRole("button", { name: "Check" }));

    const flopBox = streetBox("Flop");
    expect(within(flopBox).getByText("Flop")).toBeInTheDocument();
    expect(within(flopBox).getByText("pot 7.5bb")).toBeInTheDocument();
    expect(flopBox.querySelectorAll("[data-card]")).toHaveLength(3);
    expect(timeline()).toEqual(["Flop", "BTN:Check", "BB:Check"]);
    expect(screen.queryByTestId("past-street-details")).not.toBeInTheDocument();

    // Opening details doesn't replace the live stage — it overlays it.
    const details = openStreetDetails("Flop");
    expect(within(details).getByText(/turn card coming next/)).toBeInTheDocument();
    expect(within(liveStage()).getByText(/Pick the turn card/)).toBeInTheDocument();

    fireEvent.click(within(details).getByRole("button", { name: "Close details" }));
    expect(screen.queryByTestId("past-street-details")).not.toBeInTheDocument();

    // Clicking the same box toggles it.
    openStreetDetails("Flop");
    fireEvent.click(streetBox("Flop"));
    expect(screen.queryByTestId("past-street-details")).not.toBeInTheDocument();
  });

  it("'Pick a different board' inside a past street's details still truncates later streets and makes it live again", async () => {
    solvePostflopInWorker.mockResolvedValueOnce(checkCheckFlopResult({ P1: 0, P2: 0 }));
    renderPanel(20);

    pickFlopBoard();
    await screen.findByRole("button", { name: "Check" });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(liveStage()).toHaveAttribute("data-street", "Turn");

    fireEvent.click(within(openStreetDetails("Flop")).getByRole("button", { name: "Pick a different board" }));

    expect(liveStage()).toHaveAttribute("data-street", "Flop");
    expect(within(liveStage()).getByText(/Pick the 3 flop cards/)).toBeInTheDocument();
    expect(streetBoxSummary()).toEqual([]);
    expect(screen.queryByTestId("past-street-details")).not.toBeInTheDocument();
  });

  /** A solvePostflopInWorker call whose progress/resolution the test drives by hand, ignoring abort like a late worker message would. */
  function deferredSolve() {
    const handle: {
      signal?: AbortSignal;
      progress: (phase: "equity" | "cfr", done: number, total: number) => void;
      resolve: (result: PostflopResultMessage) => void;
    } = { progress: () => {}, resolve: () => {} };
    solvePostflopInWorker.mockImplementationOnce(
      (_req: PostflopSolveRequest, options?: { signal?: AbortSignal; onProgress?: (p: "equity" | "cfr", d: number, t: number) => void }) =>
        new Promise<PostflopResultMessage>((resolve) => {
          handle.signal = options?.signal;
          handle.progress = (phase, done, total) => options?.onProgress?.(phase, done, total);
          handle.resolve = resolve;
        }),
    );
    return handle;
  }

  async function startTurnSolveAfterFlopCheckCheck() {
    solvePostflopInWorker.mockResolvedValueOnce(checkCheckFlopResult({ P1: 0, P2: 0 }));
    const utils = renderPanel(20);
    pickFlopBoard();
    await screen.findByRole("button", { name: "Check" });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    fireEvent.click(screen.getByRole("button", { name: "Check" }));

    const turnSolve = deferredSolve();
    fireEvent.click(screen.getByRole("button", { name: "7h" }));
    fireEvent.click(screen.getByRole("button", { name: "Solve turn" }));
    return { ...utils, turnSolve };
  }

  it("going back to the flop's board picker mid-turn-solve cancels the turn solve and ignores its late messages (regression)", async () => {
    const { turnSolve } = await startTurnSolveAfterFlopCheckCheck();

    fireEvent.click(within(openStreetDetails("Flop")).getByRole("button", { name: "Pick a different board" }));
    expect(turnSolve.signal?.aborted).toBe(true);

    await act(async () => {
      turnSolve.progress("cfr", 10, 100);
      turnSolve.resolve(turnResult());
    });

    expect(screen.getAllByTestId("street-stage")).toHaveLength(1);
    expect(within(liveStage()).getByText(/Pick the 3 flop cards/)).toBeInTheDocument();
    expect(streetBoxSummary()).toEqual([]);
  });

  it("resetting the flop mid-turn-solve also cancels the turn solve (regression)", async () => {
    const { turnSolve } = await startTurnSolveAfterFlopCheckCheck();

    fireEvent.click(within(openStreetDetails("Flop")).getByRole("button", { name: "Reset to start of street" }));
    expect(turnSolve.signal?.aborted).toBe(true);

    await act(async () => {
      turnSolve.resolve(turnResult());
    });

    expect(liveStage()).toHaveAttribute("data-street", "Flop");
    expect(timeline()).toEqual(["Flop", "BTN:active"]);
    expect(streetBoxSummary()).toEqual([["Flop", "live"]]);
  });

  it("unmounting the panel cancels an in-flight solve", async () => {
    const { turnSolve, unmount } = await startTurnSolveAfterFlopCheckCheck();
    expect(turnSolve.signal?.aborted).toBe(false);
    unmount();
    expect(turnSolve.signal?.aborted).toBe(true);
  });

  it("keeps the newest timeline entry in view: the seat to act after each action, or a newly added street", async () => {
    const scrollIntoView = vi.spyOn(Element.prototype, "scrollIntoView");
    const lastScrolled = () => scrollIntoView.mock.contexts.at(-1) as HTMLElement;
    const activeSeatBox = () =>
      screen.getAllByTestId("postflop-seat-box").find((b) => b.getAttribute("data-kind") === "active");
    solvePostflopInWorker.mockResolvedValueOnce(checkCheckFlopResult({ P1: 0, P2: 0 }));
    renderPanel(20);

    pickFlopBoard();
    expect(lastScrolled()).toBe(streetBox("Flop")); // solving: the new street's box
    await screen.findByRole("button", { name: "Check" });
    expect(lastScrolled()).toBe(activeSeatBox()); // solved: the seat to act

    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(lastScrolled()).toBe(activeSeatBox()); // after an action: the next seat to act
    expect(lastScrolled()).toHaveAttribute("data-seat", "BB");

    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    solvePostflopInWorker.mockResolvedValueOnce(turnResult());
    fireEvent.click(screen.getByRole("button", { name: "7h" }));
    fireEvent.click(screen.getByRole("button", { name: "Solve turn" }));
    await screen.findByRole("button", { name: "Pick a different turn card" });
    expect(lastScrolled()).toBe(activeSeatBox());
    expect(timeline().at(-2)).toBe("Turn");
    scrollIntoView.mockRestore();
  });
  it("a turn that looked ahead to the river shows its next-street EV and still solves the picked river in full", async () => {
    solvePostflopInWorker.mockResolvedValueOnce(checkCheckFlopResult({ P1: 0, P2: 0 }));
    renderPanel(20);

    pickFlopBoard();
    await screen.findByRole("button", { name: "Check" });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    solvePostflopInWorker.mockResolvedValueOnce(turnLookaheadResult());
    fireEvent.click(screen.getByRole("button", { name: "7h" }));
    fireEvent.click(screen.getByRole("button", { name: "Solve turn" }));
    await screen.findByRole("button", { name: "Pick a different turn card" });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    fireEvent.click(screen.getByRole("button", { name: "Check" }));

    // The chance node ends the turn like a showdown would: an idle river stage, and the turn's lookahead EV.
    expect(liveStage()).toHaveAttribute("data-street", "River");
    const turnDetails = openStreetDetails("Turn");
    expect(within(turnDetails).getByText(/river card\s+coming next/)).toBeInTheDocument();
    expect(within(turnDetails).getByText(/Lookahead avg EV over the river .*BTN \+1\.50bb · BB \+6\.00bb/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close details" }));

    solvePostflopInWorker.mockResolvedValueOnce(checkCheckRiverResult({ P1: 0, P2: 0 }));
    fireEvent.click(screen.getByRole("button", { name: "Ts" }));
    fireEvent.click(screen.getByRole("button", { name: "Solve river" }));
    await screen.findByRole("button", { name: "Pick a different river card" });

    const riverRequest = solvePostflopInWorker.mock.calls[2][0] as PostflopSolveRequest;
    expect(riverRequest.kind).toBe("combos");
    if (riverRequest.kind === "combos") {
      expect(riverRequest.board).toEqual(["As", "Kd", "Qh", "7h", "Ts"]);
      expect(riverRequest.startPot).toBe(7.5);
      expect(riverRequest.effectiveStackBb).toBe(20);
      expect(riverRequest.heroRange).toEqual([{ cards: ["Ah", "Kd"], weight: 1 }]);
    }
  });
});
