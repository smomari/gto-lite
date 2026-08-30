import { describe, expect, it } from "vitest";
import { SEAT_ORDER, seatIndex } from "./seatOrder";

describe("SEAT_ORDER / seatIndex", () => {
  it("has exactly 8 unique seats in action order", () => {
    expect(SEAT_ORDER).toHaveLength(8);
    expect(new Set(SEAT_ORDER).size).toBe(8);
    expect(SEAT_ORDER).toEqual(["UTG", "UTG1", "LJ", "HJ", "CO", "BTN", "SB", "BB"]);
  });

  it("returns the correct index for each seat", () => {
    expect(seatIndex("UTG")).toBe(0);
    expect(seatIndex("CO")).toBe(4);
    expect(seatIndex("BB")).toBe(7);
  });

  it("throws for an unknown seat", () => {
    // @ts-expect-error testing runtime guard against an invalid value
    expect(() => seatIndex("MP")).toThrow();
  });
});
