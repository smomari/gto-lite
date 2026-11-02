import { describe, expect, it } from "vitest";
import { narrowReach, weightedAverage } from "./treeMath";

describe("weightedAverage", () => {
  it("weights each value and returns 0 for zero total weight", () => {
    expect(weightedAverage([1, 3], [1, 3])).toBe(2.5);
    expect(weightedAverage([1, 3], [0, 0])).toBe(0);
  });
});

describe("narrowReach", () => {
  it("multiplies each combo's reach by its probability of the taken action", () => {
    expect(narrowReach([1, 0.5], [[0.25, 0.75], [1, 0]], 1)).toEqual([0.75, 0]);
  });
});
