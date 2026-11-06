import { describe, expect, it } from "vitest";
import { anchorsAround, interpolateByStack } from "./interpolate";

const ANCHORS = [
  { stackBb: 20, value: 1 },
  { stackBb: 40, value: 3 },
  { stackBb: 100, value: 9 },
];

describe("anchorsAround", () => {
  it("stays on the first anchor at or below it", () => {
    expect(anchorsAround(ANCHORS, 10)).toEqual({ lo: ANCHORS[0], hi: ANCHORS[0], t: 0 });
    expect(anchorsAround(ANCHORS, 20)).toEqual({ lo: ANCHORS[0], hi: ANCHORS[0], t: 0 });
  });

  it("stays on the last anchor above it", () => {
    expect(anchorsAround(ANCHORS, 150)).toEqual({ lo: ANCHORS[2], hi: ANCHORS[2], t: 0 });
  });

  it("brackets a stack between two anchors", () => {
    expect(anchorsAround(ANCHORS, 30)).toEqual({ lo: ANCHORS[0], hi: ANCHORS[1], t: 0.5 });
    expect(anchorsAround(ANCHORS, 100)).toEqual({ lo: ANCHORS[1], hi: ANCHORS[2], t: 1 });
  });
});

describe("interpolateByStack", () => {
  it("is flat outside the anchors and linear between them", () => {
    const value = (stackBb: number) => interpolateByStack(ANCHORS, stackBb, (a) => a.value);
    expect(value(2)).toBe(1);
    expect(value(30)).toBe(2);
    expect(value(40)).toBe(3);
    expect(value(70)).toBe(6);
    expect(value(100)).toBe(9);
    expect(value(200)).toBe(9);
  });

  it("works with a single anchor", () => {
    expect(interpolateByStack([{ stackBb: 100, value: 5 }], 40, (a) => a.value)).toBe(5);
  });
});
