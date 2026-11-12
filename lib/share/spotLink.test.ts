import { describe, expect, it } from "vitest";
import { TOURNAMENT_8, gameFormatById } from "@/lib/solveEngine/gameFormat";
import { icmById } from "@/lib/solveEngine/icm";
import { rakeById } from "@/lib/solveEngine/rake";
import {
  DEFAULT_SETTINGS,
  EMPTY_LINE,
  actionToken,
  decodeSpot,
  encodeSpot,
  findActionByToken,
  hasSpot,
  withSpot,
  type PreflopStep,
  type Spot,
} from "./spotLink";

const CASH_6 = gameFormatById("cash-6")!;
const FOLDS_TO_BTN: PreflopStep[] = (["UTG", "UTG1", "LJ", "HJ", "CO"] as const).map((actor) => ({ actor, action: "fold" }));
/** BTN opens, SB folds, BB calls: heads-up to a flop. */
const BTN_VS_BB: PreflopStep[] = [...FOLDS_TO_BTN, { actor: "BTN", action: "raise" }, { actor: "SB", action: "fold" }, { actor: "BB", action: "call" }];

describe("encodeSpot", () => {
  it("leaves the default table with no action as a plain address", () => {
    expect(encodeSpot({ settings: DEFAULT_SETTINGS, path: [], postflop: EMPTY_LINE })).toBe("");
  });

  it("writes only what differs from the default", () => {
    const settings = { ...DEFAULT_SETTINGS, stackBb: 40 };
    expect(encodeSpot({ settings, path: BTN_VS_BB, postflop: EMPTY_LINE })).toBe("s=40&p=fffffrfc");
  });

  it("writes the board and each street's actions", () => {
    const postflop = { board: ["Kh", "7s", "2d", "9c"], streets: [["x", "b2.5", "c"], ["x"]] };
    expect(encodeSpot({ settings: DEFAULT_SETTINGS, path: BTN_VS_BB, postflop })).toBe("p=fffffrfc&b=Kh7s2d9c&l=x-b2.5-c/x");
  });

  it("leaves out a rake the format doesn't charge and an ICM stage it doesn't have", () => {
    const tournament = { ...DEFAULT_SETTINGS, rake: { structure: rakeById("live")!, noFlopNoDrop: false }, icm: icmById("bubble")! };
    expect(encodeSpot({ settings: tournament, path: [], postflop: EMPTY_LINE })).toBe("icm=bubble");
    expect(encodeSpot({ settings: { ...tournament, format: CASH_6 }, path: [], postflop: EMPTY_LINE })).toBe("f=cash-6&rk=live&nfnd=0");
  });
});

describe("decodeSpot", () => {
  const spots: Spot[] = [
    { settings: { ...DEFAULT_SETTINGS, stackBb: 40 }, path: BTN_VS_BB, postflop: { board: ["Kh", "7s", "2d"], streets: [["x", "b2.5", "r10"]] } },
    { settings: { ...DEFAULT_SETTINGS, icm: icmById("bubble")!, stackBb: 25 }, path: FOLDS_TO_BTN, postflop: EMPTY_LINE },
    {
      settings: { ...DEFAULT_SETTINGS, format: CASH_6, rake: { structure: rakeById("online-std")!, noFlopNoDrop: false } },
      path: [],
      postflop: EMPTY_LINE,
    },
    { settings: DEFAULT_SETTINGS, path: BTN_VS_BB, postflop: { board: ["Kh", "7s", "2d", "9c", "3s"], streets: [["x", "x"], ["b5", "c"], ["a", "f"]] } },
  ];

  it.each(spots)("reads back what encodeSpot wrote: $path.length preflop actions", (spot) => {
    expect(decodeSpot(encodeSpot(spot))).toEqual(spot);
  });

  it("gives the seats their turns from the order of the letters", () => {
    expect(decodeSpot("p=fffffr").path).toEqual([...FOLDS_TO_BTN, { actor: "BTN", action: "raise" }]);
  });

  it("stops a preflop line at its first unreadable or illegal action", () => {
    expect(decodeSpot("p=ffz fr").path).toHaveLength(2);
    // UTG can't call: nothing has been bet.
    expect(decodeSpot("p=c").path).toEqual([]);
    // Everyone folds to the BB, and nothing can follow that.
    expect(decodeSpot("p=fffffffr").path).toHaveLength(7);
  });

  it("falls back to the defaults for values it doesn't know", () => {
    const { settings } = decodeSpot("f=plo&s=1000&icm=nope&rk=free");
    expect(settings).toEqual(DEFAULT_SETTINGS);
    expect(decodeSpot("s=12.5").settings.stackBb).toBe(100);
  });

  it("drops a board that isn't a whole flop, repeats a card, or follows an unfinished preflop", () => {
    expect(decodeSpot("p=fffffrfc&b=Kh7s").postflop).toEqual(EMPTY_LINE);
    expect(decodeSpot("p=fffffrfc&b=Kh7sKh").postflop).toEqual(EMPTY_LINE);
    expect(decodeSpot("p=fffffrfc&b=Kh7s2dXx").postflop.board).toEqual(["Kh", "7s", "2d"]);
    expect(decodeSpot("p=fffffr&b=Kh7s2d").postflop).toEqual(EMPTY_LINE);
  });

  it("keeps a street's actions up to the first unreadable one, and no more streets than the board has", () => {
    expect(decodeSpot("p=fffffrfc&b=Kh7s2d&l=x-bet-c").postflop.streets).toEqual([["x"]]);
    expect(decodeSpot("p=fffffrfc&b=Kh7s2d&l=x-x/b5").postflop.streets).toEqual([["x", "x"]]);
  });

  it("takes the rake of a tournament link, which has none of its own, from the fallback", () => {
    const fallback = { ...DEFAULT_SETTINGS, rake: { structure: rakeById("live")!, noFlopNoDrop: true } };
    expect(decodeSpot("s=40", fallback).settings).toEqual({ ...DEFAULT_SETTINGS, stackBb: 40, format: TOURNAMENT_8, rake: fallback.rake });
  });
});

describe("withSpot", () => {
  it("replaces the spot in an address and keeps what else is there", () => {
    expect(withSpot("?utm_source=reddit&s=20&p=ff&b=Kh7s2d", "s=40&p=fffff")).toBe("utm_source=reddit&s=40&p=fffff");
    expect(withSpot("", "s=40&p=fffff")).toBe("s=40&p=fffff");
  });

  it("clears the spot when there is none to write", () => {
    expect(withSpot("?s=20&p=ff", "")).toBe("");
    expect(withSpot("?s=20&utm_source=reddit", "")).toBe("utm_source=reddit");
  });
});

describe("hasSpot", () => {
  it("is true only for an address with a spot's own keys", () => {
    expect(hasSpot("")).toBe(false);
    expect(hasSpot("?utm_source=reddit")).toBe(false);
    expect(hasSpot("?s=40")).toBe(true);
  });
});

describe("postflop action tokens", () => {
  const actions = [
    { action: "check", label: "Check" },
    { action: "bet", label: "Bet 2.5bb" },
    { action: "bet", label: "Bet 3.8bb" },
    { action: "bet", label: "Bet 7.5bb" },
    { action: "allin", label: "Allin 97.0bb" },
  ] as const;

  it("names an action by its kind and size", () => {
    expect(actions.map((a) => actionToken(a))).toEqual(["x", "b2.5", "b3.8", "b7.5", "a"]);
    expect(actionToken({ action: "raise", label: "Raise to 22.5bb" })).toBe("r22.5");
    expect(actionToken({ action: "fold", label: "Fold" })).toBe("f");
    expect(actionToken({ action: "call", label: "Call" })).toBe("c");
  });

  it("finds the action a token names, whatever else the menu now offers", () => {
    expect(findActionByToken([...actions], "b3.8")).toBe(actions[2]);
    expect(findActionByToken([...actions], "b3.75")).toBe(actions[2]);
    expect(findActionByToken([...actions], "x")).toBe(actions[0]);
    expect(findActionByToken([...actions], "a")).toBe(actions[4]);
  });

  it("finds nothing for a size the menu no longer has", () => {
    expect(findActionByToken([...actions], "b5")).toBeUndefined();
    expect(findActionByToken([...actions], "r7.5")).toBeUndefined();
    expect(findActionByToken([...actions], "c")).toBeUndefined();
  });
});
