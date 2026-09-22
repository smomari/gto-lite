import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PostflopBoardStrip } from "./PostflopBoardStrip";

describe("PostflopBoardStrip", () => {
  it("renders nothing when no street has a confirmed board yet", () => {
    const { container } = render(<PostflopBoardStrip streets={[{ streetLabel: "Flop", board: [] }]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows only the most advanced confirmed street's (cumulative) board, not every street", () => {
    render(
      <PostflopBoardStrip
        streets={[
          { streetLabel: "Flop", board: ["Kh", "7s", "2d"] },
          { streetLabel: "Turn", board: ["Kh", "7s", "2d", "9c"] },
        ]}
      />,
    );
    const strips = screen.getAllByTestId("postflop-board-strip");
    expect(strips).toHaveLength(1);
    expect(screen.getByText("Turn")).toBeInTheDocument();
    expect(strips[0].querySelectorAll("[data-card]")).toHaveLength(4);
  });

  it("omits a street with an empty (idle) board from consideration", () => {
    render(
      <PostflopBoardStrip
        streets={[
          { streetLabel: "Flop", board: ["Kh", "7s", "2d"] },
          { streetLabel: "Turn", board: [] },
        ]}
      />,
    );
    expect(screen.getByText("Flop")).toBeInTheDocument();
    expect(screen.queryByText("Turn")).not.toBeInTheDocument();
  });
});
