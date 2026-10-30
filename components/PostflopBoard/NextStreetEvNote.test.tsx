import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextStreetEvNote } from "./NextStreetEvNote";

describe("NextStreetEvNote", () => {
  it("renders both players' solved EV over the next street's cards", () => {
    render(<NextStreetEvNote ev={{ heroEvBb: 2.5, villainEvBb: 4.25 }} heroLabel="BB" villainLabel="BTN" nextStreetLabel="River" />);
    expect(
      screen.getByText("Solved avg EV over every river card (with further betting): BB +2.50bb · BTN +4.25bb"),
    ).toBeInTheDocument();
  });
});
