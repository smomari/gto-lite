import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { StackSizeControl } from "./StackSizeControl";

describe("StackSizeControl", () => {
  it("renders a slider by default", () => {
    render(<StackSizeControl value={100} onChange={() => {}} />);
    expect(screen.getByRole("slider")).toBeInTheDocument();
    expect(screen.getByRole("spinbutton")).toHaveValue(100);
  });

  it("compact mode drops the slider but keeps the number input functional", () => {
    const onChange = vi.fn();
    render(<StackSizeControl value={100} onChange={onChange} compact />);
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    const numberInput = screen.getByRole("spinbutton");
    expect(numberInput).toHaveValue(100);
    fireEvent.change(numberInput, { target: { value: "50" } });
    expect(onChange).toHaveBeenCalledWith(50);
  });
});
