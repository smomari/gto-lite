import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { StreetBox } from "./StreetBox";

describe("StreetBox", () => {
  it("shows the street, only that street's cards, and the pot", () => {
    render(<StreetBox streetLabel="Turn" cards={["9s"]} potBb={18.3} status="past" selected={false} onClick={() => {}} />);
    const box = screen.getByTestId("street-box");
    expect(box).toHaveAttribute("data-street", "Turn");
    expect(box).toHaveAttribute("data-status", "past");
    expect(screen.getByText("Turn")).toBeInTheDocument();
    expect(screen.getByText("pot 18.3bb")).toBeInTheDocument();
    expect(box.querySelectorAll("[data-card]")).toHaveLength(1);
  });

  it("a past street box is clickable", () => {
    const onClick = vi.fn();
    render(<StreetBox streetLabel="Flop" cards={["Kh", "7s", "2d"]} potBb={7.1} status="past" selected={false} onClick={onClick} />);
    fireEvent.click(screen.getByTestId("street-box"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("the live street box is highlighted and not clickable", () => {
    const onClick = vi.fn();
    render(
      <StreetBox streetLabel="River" cards={["4s"]} potBb={7.1} status="live" selected={false} onClick={onClick} />,
    );
    const box = screen.getByTestId("street-box");
    expect(box).toBeDisabled();
    expect(box.className).toContain("border-emerald-500");
    fireEvent.click(box);
    expect(onClick).not.toHaveBeenCalled();
  });
});
