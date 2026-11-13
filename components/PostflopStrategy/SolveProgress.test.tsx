import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SolveProgress } from "./SolveProgress";

describe("SolveProgress", () => {
  it("says a flop's first pass is picking bet sizes, without an exploitability reading", () => {
    render(<SolveProgress phase="sizes" done={100} total={3000} exploitabilityPercent={1.2} targetExploitabilityPercent={0.5} />);
    expect(screen.getByRole("progressbar", { name: "Picking bet sizes" })).toBeInTheDocument();
    expect(screen.queryByText(/exploitability/)).not.toBeInTheDocument();
  });

  it("shows the reading against its target while the shown solve runs", () => {
    render(<SolveProgress phase="cfr" done={100} total={3000} exploitabilityPercent={1.2} targetExploitabilityPercent={0.5} />);
    expect(screen.getByRole("progressbar", { name: "Running CFR" })).toHaveTextContent("exploitability 1.20% pot (target 0.50%)");
  });
});
