import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PostflopTerminalMessage } from "./PostflopTerminalMessage";

describe("PostflopTerminalMessage", () => {
  it("terminal-fold: names the winning seat and the pot", () => {
    render(
      <PostflopTerminalMessage
        node={{ type: "terminal-fold", potBb: 12, winner: "P2", committed: { P1: 0, P2: 0 } }}
        heroLabel="BTN"
        villainLabel="BB"
        showdownMessage={() => "unused"}
      />,
    );
    expect(screen.getByText("BB wins uncontested — pot 12.0bb.")).toBeInTheDocument();
  });

  it("terminal-showdown: uses the caller's showdown wording", () => {
    render(
      <PostflopTerminalMessage
        node={{ type: "terminal-showdown", potBb: 10, committed: { P1: 0, P2: 0 } }}
        heroLabel="BTN"
        villainLabel="BB"
        showdownMessage={(potBb) => `Custom message, pot ${potBb.toFixed(1)}bb`}
      />,
    );
    expect(screen.getByText("Custom message, pot 10.0bb")).toBeInTheDocument();
  });
});
