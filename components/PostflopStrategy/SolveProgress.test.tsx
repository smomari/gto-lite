import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SolveProgress } from "./SolveProgress";

afterEach(() => vi.unstubAllGlobals());

describe("SolveProgress", () => {
  it("says the solver is slow here only when the page can't share memory with its workers", () => {
    const hint = /one thread/;
    const { unmount } = render(<SolveProgress phase="cfr" done={0} total={1} />);
    expect(screen.queryByText(hint)).not.toBeInTheDocument();
    unmount();

    vi.stubGlobal("crossOriginIsolated", true);
    render(<SolveProgress phase="cfr" done={0} total={1} />).unmount();
    expect(screen.queryByText(hint)).not.toBeInTheDocument();

    vi.stubGlobal("crossOriginIsolated", false);
    render(<SolveProgress phase="equity" done={0} total={1} />);
    expect(screen.getByText(hint)).toBeInTheDocument();
  });

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
