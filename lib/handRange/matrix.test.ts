import { describe, expect, it } from "vitest";
import { HAND_MATRIX } from "./matrix";
import { ALL_HANDS } from "./handList";

describe("HAND_MATRIX", () => {
  it("is a 13x13 grid", () => {
    expect(HAND_MATRIX).toHaveLength(13);
    for (const row of HAND_MATRIX) {
      expect(row).toHaveLength(13);
    }
  });

  it("places pairs on the diagonal", () => {
    expect(HAND_MATRIX[0][0]).toBe("AA");
    expect(HAND_MATRIX[12][12]).toBe("22");
    expect(HAND_MATRIX[5][5]).toBe("99");
  });

  it("places suited hands above the diagonal", () => {
    expect(HAND_MATRIX[0][1]).toBe("AKs");
    expect(HAND_MATRIX[0][12]).toBe("A2s");
  });

  it("places offsuit hands below the diagonal", () => {
    expect(HAND_MATRIX[1][0]).toBe("AKo");
    expect(HAND_MATRIX[12][0]).toBe("A2o");
  });

  it("contains exactly the same 169 hand labels as ALL_HANDS", () => {
    const fromMatrix = new Set(HAND_MATRIX.flat());
    const fromList = new Set(ALL_HANDS.map((h) => h.hand));
    expect(fromMatrix.size).toBe(169);
    expect(fromMatrix).toEqual(fromList);
  });
});
