import { describe, expect, it } from "vitest";
import { formatPercent, formatSignedBb } from "./format";

describe("formatPercent", () => {
  it("formats a 0..1 fraction to one decimal place", () => {
    expect(formatPercent(0.123)).toBe("12.3%");
    expect(formatPercent(1)).toBe("100.0%");
  });
});

describe("formatSignedBb", () => {
  it("prefixes positive values with + and leaves zero unsigned", () => {
    expect(formatSignedBb(0.75)).toBe("+0.75bb");
    expect(formatSignedBb(-0.75)).toBe("-0.75bb");
    expect(formatSignedBb(0)).toBe("0.00bb");
  });
});
