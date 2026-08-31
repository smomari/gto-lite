import { describe, expect, it } from "vitest";
import { canonicalHandOf } from "./canonicalHand";

describe("canonicalHandOf", () => {
  it("maps a pocket pair regardless of suit order", () => {
    expect(canonicalHandOf(["As", "Ah"])).toBe("AA");
    expect(canonicalHandOf(["6c", "6d"])).toBe("66");
  });

  it("maps a suited combo with the high rank first", () => {
    expect(canonicalHandOf(["As", "6s"])).toBe("A6s");
    expect(canonicalHandOf(["6s", "As"])).toBe("A6s");
  });

  it("maps an offsuit combo with the high rank first", () => {
    expect(canonicalHandOf(["Ah", "6s"])).toBe("A6o");
    expect(canonicalHandOf(["6s", "Ah"])).toBe("A6o");
  });

  it("handles ten card codes ('T')", () => {
    expect(canonicalHandOf(["Ts", "9s"])).toBe("T9s");
  });
});
