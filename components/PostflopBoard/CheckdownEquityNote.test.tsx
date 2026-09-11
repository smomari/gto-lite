import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CheckdownEquityNote } from "./CheckdownEquityNote";
import type { CheckdownEquitySummary } from "@/types/postflopSolver";

function makeEquity(overrides: Partial<CheckdownEquitySummary> = {}): CheckdownEquitySummary {
  return {
    heroEquityPercent: 62.345,
    villainEquityPercent: 37.655,
    heroEvBb: 1.234,
    villainEvBb: -1.234,
    ...overrides,
  };
}

describe("CheckdownEquityNote", () => {
  it("renders both players' equity/EV with the checkdown caveat and a leading '+' on positive bb", () => {
    render(<CheckdownEquityNote equity={makeEquity()} heroLabel="BB" villainLabel="UTG" />);
    expect(
      screen.getByText("Checkdown avg EV (all remaining runouts, assumes no further betting): BB 62.3% / +1.23bb · UTG 37.7% / -1.23bb"),
    ).toBeInTheDocument();
  });

  it("does not add a '+' prefix for a negative or zero EV", () => {
    render(<CheckdownEquityNote equity={makeEquity({ heroEvBb: 0, villainEvBb: -0.5 })} heroLabel="Hero" villainLabel="Villain" />);
    expect(screen.getByText(/Hero 62\.3% \/ 0\.00bb/)).toBeInTheDocument();
    expect(screen.getByText(/Villain 37\.7% \/ -0\.50bb/)).toBeInTheDocument();
  });
});
