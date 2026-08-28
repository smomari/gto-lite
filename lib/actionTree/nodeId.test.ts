import { describe, expect, it } from "vitest";
import { buildNodeId } from "./nodeId";

describe("buildNodeId", () => {
  it("returns 'rfi' for an empty action path", () => {
    expect(buildNodeId([])).toBe("rfi");
  });

  it("serializes a single action step", () => {
    expect(buildNodeId([{ actor: "CO", action: "raise", label: "open" }])).toBe("CO-open");
  });

  it("serializes a multi-step path in order", () => {
    expect(
      buildNodeId([
        { actor: "CO", action: "raise", label: "open" },
        { actor: "BTN", action: "raise", label: "3bet" },
      ]),
    ).toBe("CO-open_BTN-3bet");
  });

  it("represents squeeze spots the same way (path just keeps accumulating)", () => {
    expect(
      buildNodeId([
        { actor: "BTN", action: "raise", label: "open" },
        { actor: "SB", action: "call", label: "cold-call" },
      ]),
    ).toBe("BTN-open_SB-cold-call");
  });
});
