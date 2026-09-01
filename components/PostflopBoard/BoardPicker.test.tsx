import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { BoardPicker } from "./BoardPicker";

describe("BoardPicker", () => {
  it("shows the given title/count and disables confirm until count cards are picked", () => {
    const onConfirm = vi.fn();
    render(<BoardPicker count={3} title="Pick the 3 flop cards" confirmLabel="Solve flop" onConfirm={onConfirm} />);

    expect(screen.getByText("Pick the 3 flop cards (0/3).")).toBeInTheDocument();
    const confirmButton = screen.getByRole("button", { name: "Solve flop" });
    expect(confirmButton).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "As" }));
    fireEvent.click(screen.getByRole("button", { name: "Kd" }));
    expect(confirmButton).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Qh" }));

    expect(confirmButton).not.toBeDisabled();
    fireEvent.click(confirmButton);
    expect(onConfirm).toHaveBeenCalledWith(["As", "Kd", "Qh"]);
  });

  it("count=1 enables confirm after a single pick (turn card)", () => {
    const onConfirm = vi.fn();
    render(<BoardPicker count={1} title="Pick the turn card" confirmLabel="Solve turn" onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "7c" }));
    fireEvent.click(screen.getByRole("button", { name: "Solve turn" }));
    expect(onConfirm).toHaveBeenCalledWith(["7c"]);
  });

  it("excludedCards are disabled and never selectable", () => {
    render(
      <BoardPicker
        count={1}
        excludedCards={["As", "Kd", "Qh"]}
        title="Pick the turn card"
        confirmLabel="Solve turn"
        onConfirm={() => {}}
      />,
    );

    const excludedButton = screen.getByRole("button", { name: "As" });
    expect(excludedButton).toBeDisabled();
    fireEvent.click(excludedButton);
    expect(screen.getByText("Pick the turn card (0/1).")).toBeInTheDocument();
  });
});
