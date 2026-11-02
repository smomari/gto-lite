import { describe, expect, it } from "vitest";
import { DEFAULT_RAKE_SETTINGS, NO_RAKE, RAKE_PRESETS, netPot, rakeById, rakeForPot, rakeShare, rakeSummary } from "./rake";

describe("rakeForPot", () => {
  const terms = { rate: 0.05, capBb: 3 };

  it("takes the rate until the cap", () => {
    expect(rakeForPot(20, terms)).toBeCloseTo(1, 10);
    expect(rakeForPot(60, terms)).toBeCloseTo(3, 10);
    expect(rakeForPot(200, terms)).toBe(3);
  });

  it("takes nothing with no rake, leaving the pot exact", () => {
    expect(rakeForPot(33.3, NO_RAKE)).toBe(0);
    expect(netPot(33.3, NO_RAKE)).toBe(33.3);
  });

  it("leaves the winner the rest of the pot", () => {
    expect(netPot(200, terms)).toBe(197);
  });
});

describe("rakeShare", () => {
  it("is nothing with no rake, and sets every preset apart", () => {
    expect(rakeShare(NO_RAKE)).toBe(0);
    const shares = RAKE_PRESETS.map(rakeShare);
    expect([...shares].sort((a, b) => a - b)).toEqual(shares);
    expect(new Set(shares).size).toBe(RAKE_PRESETS.length);
  });
});

describe("presets", () => {
  it("offers the agreed structures", () => {
    expect(RAKE_PRESETS.map((r) => [r.label, rakeSummary(r), r.stakes])).toEqual([
      ["No rake", "No rake", ""],
      ["Online high", "5%/1bb", "NL500+"],
      ["Online mid", "5%/2.5bb", "NL200"],
      ["Online std", "5%/3bb", "NL50~100 · GG"],
      ["Online low", "5%/5bb", "NL10~25"],
      ["Live", "10%/3bb", "라이브 1/2~1/3"],
    ]);
  });

  it("defaults to online low, no flop no drop", () => {
    expect(DEFAULT_RAKE_SETTINGS.structure.id).toBe("online-low");
    expect(DEFAULT_RAKE_SETTINGS.noFlopNoDrop).toBe(true);
  });

  it("finds a preset by id and rejects anything else", () => {
    for (const rake of RAKE_PRESETS) expect(rakeById(rake.id)).toBe(rake);
    expect(rakeById("rake-free")).toBeUndefined();
  });
});
