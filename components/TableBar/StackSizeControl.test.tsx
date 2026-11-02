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

  it("reports changes from the number input", () => {
    const onChange = vi.fn();
    render(<StackSizeControl value={100} onChange={onChange} />);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "50" } });
    expect(onChange).toHaveBeenCalledWith(50);
  });
});
