import { describe, expect, it } from "vitest";
import { ALL_HANDS, HAND_BY_LABEL, TOTAL_COMBOS } from "./handList";

describe("ALL_HANDS", () => {
  it("has exactly 169 unique hands", () => {
    expect(ALL_HANDS).toHaveLength(169);
    expect(new Set(ALL_HANDS.map((h) => h.hand)).size).toBe(169);
  });

  it("combo counts sum to 1326 (C(52,2))", () => {
    expect(TOTAL_COMBOS).toBe(1326);
  });

  it("has 13 pairs, 78 suited, 78 offsuit", () => {
    const byType = (type: string) =>
      ALL_HANDS.filter((h) => h.type === type).length;
    expect(byType("pair")).toBe(13);
    expect(byType("suited")).toBe(78);
    expect(byType("offsuit")).toBe(78);
  });

  it("assigns correct combo counts per hand type", () => {
    expect(HAND_BY_LABEL.get("AA")?.combos).toBe(6);
    expect(HAND_BY_LABEL.get("AKs")?.combos).toBe(4);
    expect(HAND_BY_LABEL.get("AKo")?.combos).toBe(12);
  });
});
