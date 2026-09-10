import { describe, expect, it } from "vitest";
import { loadRfiExport } from "./loadRfiExport";

describe("loadRfiExport", () => {
  const data = loadRfiExport();

  it("has SB (the only currently-covered position — see Phase C-1 plan doc), with 169 hands summing to ~1 fold+raise", () => {
    const positionData = data.positions.SB;
    expect(positionData).toBeDefined();
    expect(positionData!.hands).toHaveLength(169);
    for (const h of positionData!.hands) {
      expect(h.fold + h.raise).toBeCloseTo(1, 3);
    }
  });

  it("does not cover any position other than SB", () => {
    expect(Object.keys(data.positions)).toEqual(["SB"]);
  });

  it("caches across calls (same object reference)", () => {
    expect(loadRfiExport()).toBe(data);
  });

  it("was generated at the stack depth solve.ts's RFI_EXPORT_STACK_BB expects", () => {
    expect(data.stackDepth).toBe(100);
  });
});
