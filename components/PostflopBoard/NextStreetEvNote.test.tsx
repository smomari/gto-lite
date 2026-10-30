import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextStreetEvNote } from "./NextStreetEvNote";

describe("NextStreetEvNote", () => {
  it("renders both players' lookahead EV for the next street, with its caveat", () => {
    render(<NextStreetEvNote ev={{ heroEvBb: 2.5, villainEvBb: 4.25 }} heroLabel="BB" villainLabel="BTN" nextStreetLabel="River" />);
    expect(
      screen.getByText("Lookahead avg EV over the river (sampled cards, simplified later betting): BB +2.50bb · BTN +4.25bb"),
    ).toBeInTheDocument();
  });
});
