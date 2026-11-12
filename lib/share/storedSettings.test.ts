import { beforeEach, describe, expect, it } from "vitest";
import { gameFormatById } from "@/lib/solveEngine/gameFormat";
import { icmById } from "@/lib/solveEngine/icm";
import { rakeById } from "@/lib/solveEngine/rake";
import { DEFAULT_SETTINGS, EMPTY_LINE } from "./spotLink";
import { initialSpot, readStoredSettings, storeSettings } from "./storedSettings";

// Node's own localStorage shadows jsdom's and is unusable without a file, so each test gets a plain one.
let stored: Map<string, string>;
beforeEach(() => {
  stored = new Map();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value) },
  });
});

const cashLive = {
  stackBb: 60,
  format: gameFormatById("cash-6")!,
  rake: { structure: rakeById("live")!, noFlopNoDrop: false },
  icm: icmById("bubble")!,
};

describe("stored settings", () => {
  it("reads back the table it stored", () => {
    storeSettings(cashLive);
    expect(readStoredSettings()).toEqual(cashLive);
  });

  it("is the default table when nothing is stored, the value is unreadable, or storage is refused", () => {
    expect(readStoredSettings()).toEqual(DEFAULT_SETTINGS);
    stored.set("gtoLite.settings", "{not json");
    expect(readStoredSettings()).toEqual(DEFAULT_SETTINGS);
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => {
        throw new Error("denied");
      },
    });
    expect(readStoredSettings()).toEqual(DEFAULT_SETTINGS);
    expect(() => storeSettings(cashLive)).not.toThrow();
  });

  it("replaces a stored value it doesn't know with the default, one field at a time", () => {
    stored.set("gtoLite.settings", JSON.stringify({ stackBb: 500, format: "cash-6", rake: "free", icm: "bubble" }));
    expect(readStoredSettings()).toEqual({ ...DEFAULT_SETTINGS, format: cashLive.format, icm: cashLive.icm });
  });
});

describe("initialSpot", () => {
  it("starts an empty hand at the remembered table when the address has no spot", () => {
    storeSettings(cashLive);
    expect(initialSpot("?utm_source=reddit")).toEqual({ settings: cashLive, path: [], postflop: EMPTY_LINE });
  });

  it("starts at the address's spot, taking only what its format doesn't use from the remembered table", () => {
    storeSettings(cashLive);
    const spot = initialSpot("?s=40&p=ff");
    expect(spot.settings).toEqual({ ...DEFAULT_SETTINGS, stackBb: 40, rake: cashLive.rake });
    expect(spot.path).toHaveLength(2);
  });
});
