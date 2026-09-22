import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PastStreetSummary } from "./PastStreetSummary";

describe("PastStreetSummary", () => {
  it("shows board/actions/pot in the collapsed row and omits children until expanded", () => {
    render(
      <PastStreetSummary
        streetLabel="Flop"
        board={["Kh", "7s", "2d"]}
        potBb={18.3}
        actionLabels={["Check", "Check"]}
        expanded={false}
        onToggleExpand={() => {}}
      >
        <div data-testid="full-content">details</div>
      </PastStreetSummary>,
    );
    expect(screen.getByText("Flop")).toBeInTheDocument();
    expect(screen.getByText("Check → Check")).toBeInTheDocument();
    expect(screen.getByText("pot 18.3bb")).toBeInTheDocument();
    expect(screen.queryByTestId("full-content")).not.toBeInTheDocument();
  });

  it("renders children when expanded and calls onToggleExpand on click", () => {
    const onToggleExpand = vi.fn();
    render(
      <PastStreetSummary
        streetLabel="Turn"
        board={["Kh", "7s", "2d", "9c"]}
        potBb={20}
        actionLabels={[]}
        expanded={true}
        onToggleExpand={onToggleExpand}
      >
        <div data-testid="full-content">details</div>
      </PastStreetSummary>,
    );
    expect(screen.getByTestId("full-content")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(onToggleExpand).toHaveBeenCalledTimes(1);
  });
});
