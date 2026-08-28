import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RangeGrid } from "./RangeGrid";
import { ALL_HANDS } from "@/lib/handRange/handList";
import type { RangeScenario } from "@/types/rangeData";

function makeScenario(): RangeScenario {
  return {
    heroPosition: "BTN",
    stackDepth: 100,
    nodeId: "rfi",
    actionPath: [],
    source: "heuristic-approx",
    generatedAt: new Date(0).toISOString(),
    version: "test",
    hands: ALL_HANDS.map((h) =>
      h.hand === "AA"
        ? { hand: h.hand, fold: 0, call: 0, raise: 1 }
        : { hand: h.hand, fold: 1, call: 0, raise: 0 },
    ),
  };
}

describe("RangeGrid", () => {
  it("renders exactly 169 hand cells", () => {
    render(<RangeGrid scenario={makeScenario()} />);
    expect(screen.getAllByTestId("hand-cell")).toHaveLength(169);
  });

  it("gives the raised hand a fully raise-colored bar", () => {
    render(<RangeGrid scenario={makeScenario()} />);
    const aaCell = screen.getAllByTestId("hand-cell").find(
      (el) => el.getAttribute("data-hand") === "AA",
    );
    expect(aaCell).toBeTruthy();
    expect(aaCell).toHaveAttribute(
      "title",
      expect.stringContaining("Raise 100.0%"),
    );
  });

  it("renders the four-item action legend", () => {
    render(<RangeGrid scenario={makeScenario()} />);
    expect(screen.getByText("Fold")).toBeInTheDocument();
    expect(screen.getByText("Call")).toBeInTheDocument();
    expect(screen.getByText("Raise")).toBeInTheDocument();
    expect(screen.getByText("All-in")).toBeInTheDocument();
  });
});
