import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SeatActionBar } from "./SeatActionBar";
import { initialPotState } from "@/lib/solveEngine/potState";
import { computeAvailableActions } from "@/lib/solveEngine/actionSizing";
import type { ActionNode } from "@/types/rangeData";

const noop = () => {};

describe("SeatActionBar", () => {
  it("round 1: renders one active box and the rest as pending, no history boxes", () => {
    const availableActions = computeAvailableActions("UTG", initialPotState(), 100);
    render(
      <SeatActionBar
        stackBb={100}
        actionPath={[]}
        activeSeat="UTG"
        availableActions={availableActions}
        loading={false}
        onAction={noop}
        onRevisit={noop}
        onQuickAction={noop}
      />,
    );

    const boxes = screen.getAllByTestId("seat-box");
    expect(boxes).toHaveLength(8);
    expect(boxes.filter((b) => b.getAttribute("data-kind") === "history")).toHaveLength(0);

    const activeBoxes = boxes.filter((b) => b.getAttribute("data-kind") === "active");
    expect(activeBoxes).toHaveLength(1);
    expect(activeBoxes[0]).toHaveAttribute("data-position", "UTG");

    expect(boxes.filter((b) => b.getAttribute("data-kind") === "pending")).toHaveLength(7);
  });

  it("reopened round: a new active CO box appears right after BB's history box, not merged with CO's first box", () => {
    const actionPath: ActionNode[] = [
      { actor: "UTG", action: "fold", label: "fold" },
      { actor: "UTG1", action: "fold", label: "fold" },
      { actor: "LJ", action: "fold", label: "fold" },
      { actor: "HJ", action: "fold", label: "fold" },
      { actor: "CO", action: "raise", label: "open", sizeBb: 3 },
      { actor: "BTN", action: "fold", label: "fold" },
      { actor: "SB", action: "fold", label: "fold" },
      { actor: "BB", action: "raise", label: "3bet", sizeBb: 9 },
    ];
    const onAction = vi.fn();
    const onRevisit = vi.fn();

    render(
      <SeatActionBar
        stackBb={100}
        actionPath={actionPath}
        activeSeat="CO"
        availableActions={{ fold: true, call: { label: "Call", amountBb: 6 }, raise: null, allin: { toBb: 100 } }}
        loading={false}
        onAction={onAction}
        onRevisit={onRevisit}
        onQuickAction={noop}
      />,
    );

    const boxes = screen.getAllByTestId("seat-box");
    expect(boxes).toHaveLength(9); // 8 history + 1 active, CO/BB are heads-up so no pending seats
    expect(boxes.filter((b) => b.getAttribute("data-kind") === "pending")).toHaveLength(0);

    const coBoxes = boxes.filter((b) => b.getAttribute("data-position") === "CO");
    expect(coBoxes).toHaveLength(2);
    expect(coBoxes[0].getAttribute("data-kind")).toBe("history");
    expect(coBoxes[1].getAttribute("data-kind")).toBe("active");
    // The active CO box must be the very last box — right after BB's history box.
    expect(boxes[boxes.length - 1]).toBe(coBoxes[1]);
    expect(boxes[boxes.length - 2].getAttribute("data-position")).toBe("BB");

    coBoxes[1].querySelector("button")?.click();
    expect(onAction).toHaveBeenCalledWith("fold");

    coBoxes[0].querySelector("button")?.click();
    expect(onRevisit).toHaveBeenCalledWith(4);
  });
});
