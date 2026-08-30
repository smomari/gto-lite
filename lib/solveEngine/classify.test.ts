import { describe, expect, it } from "vitest";
import { shouldUseNash } from "./classify";

describe("shouldUseNash", () => {
  it("always Nash at or under the flat stack threshold, regardless of pot", () => {
    expect(shouldUseNash(25, 25, 2.5, false)).toBe(true);
    expect(shouldUseNash(10, 10, 2.5, false)).toBe(true);
  });

  it("Nash when facing a raise with a low stack-to-pot ratio, even at a deep starting stack", () => {
    // 100bb starting stack, but after several raises only 20bb remains behind a 25bb pot.
    expect(shouldUseNash(100, 20, 25, true)).toBe(true);
  });

  it("heuristic when deep-stacked with no raise yet", () => {
    expect(shouldUseNash(100, 100, 2.5, false)).toBe(false);
  });

  it("heuristic when facing a raise but the stack-to-pot ratio is still high", () => {
    expect(shouldUseNash(100, 90, 10, true)).toBe(false);
  });
});
