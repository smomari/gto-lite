import { describe, expect, it } from "vitest";
import { SEAT_ORDER } from "@/lib/actionTree/seatOrder";
import { loadEquityMatrix } from "@/lib/equity/loadEquityMatrix";
import { HAND_BY_LABEL, TOTAL_COMBOS } from "@/lib/handRange/handList";
import type { ActionType, HandFrequency, Position } from "@/types/rangeData";
import { gameFormatById, TOURNAMENT_8, type GameFormat } from "./gameFormat";
import { DEFAULT_RAKE_SETTINGS, NO_RAKE_SETTINGS, type RakeSettings } from "./rake";
import { replayActionPath } from "./replay";
import { solveActiveSeat } from "./solve";

/**
 * Spots GTO Wizard wasn't asked about, held to the aggregate frequencies of a
 * second set of solver ranges: the public per-hand charts in
 * github.com/jensbaagaard/poker-practice (data/openSourcePokerData, Cash_100_GTO
 * and MTT_{100,40,20}_GTO, read 2026-11-04). Where its trees match GTO
 * Wizard's they agree within 2–3pp. Its sizes differ a little from ours (2.3bb
 * tournament opens, 3.5x/4.5x 3-bets at 100bb, 3x/5x at cash), hence the
 * looser tolerance. Raise (incl. all-in) / call / fold, % of all hands, or of
 * the hands that reached the spot where noted.
 */
const matrix = loadEquityMatrix();
const TOLERANCE = 4;

interface Game {
  format: GameFormat;
  stack: number;
  rake: RakeSettings;
}
const MTT = (stack: number): Game => ({ format: TOURNAMENT_8, stack, rake: NO_RAKE_SETTINGS });
const CASH: Game = { format: gameFormatById("cash-6")!, stack: 100, rake: DEFAULT_RAKE_SETTINGS };

/** Everyone not named folds when the action reaches them; the named seats act in order. */
function path(game: Game, moves: [Position, ActionType][]) {
  const live = SEAT_ORDER.filter((s) => !game.format.absentSeats.includes(s));
  const out: { actor: Position; action: ActionType }[] = [];
  let at = 0;
  for (const [seat, action] of moves) {
    while (live[at % live.length] !== seat) {
      const actor = live[at % live.length];
      if (!out.some((p) => p.actor === actor && p.action === "fold")) out.push({ actor, action: "fold" });
      at++;
    }
    out.push({ actor: seat, action });
    at++;
  }
  return out;
}

function hands(game: Game, moves: [Position, ActionType][], next: Position) {
  const result = replayActionPath(path(game, [...moves, [next, "fold"]]).slice(0, -1), game.stack, game.format);
  if (result.status !== "active" || result.activeSeat !== next) throw new Error(`expected ${next} to act`);
  return solveActiveSeat(matrix, next, result.potState, game.stack, game.rake).hands;
}

const share = (hs: HandFrequency[], weight: (h: HandFrequency, i: number) => number) =>
  (100 * hs.reduce((sum, h, i) => sum + weight(h, i) * HAND_BY_LABEL.get(h.hand)!.combos, 0)) / TOTAL_COMBOS;
const raised = (h: HandFrequency) => h.raise + (h.allin ?? 0);

/** Raises and calls together, % of all hands. */
const continued = (hs: HandFrequency[]) => share(hs, (h) => 1 - h.fold);

function ofRange(hs: HandFrequency[], before: HandFrequency[], reach: (h: HandFrequency) => number): number[] {
  const width = share(before, reach);
  const raise = share(hs, (h, i) => raised(h) * reach(before[i])) / width;
  const call = share(hs, (h, i) => h.call * reach(before[i])) / width;
  return [100 * raise, 100 * call, 100 - 100 * (raise + call)];
}

function expectNear(got: number[], want: number[], tolerance = TOLERANCE) {
  got.forEach((value, i) => expect(Math.abs(value - want[i]), `${got.map((x) => x.toFixed(1))} vs ${want}`).toBeLessThanOrEqual(tolerance));
}

describe("against public solver ranges", () => {
  /**
   * The BB's defense against each opener, raises and calls together. At 100bb
   * the reference defends UTG and UTG1 wider than LJ — no single curve takes
   * that — so there it is held on average with a looser cap; its 40bb BB, facing
   * bigger opens than ours, isn't held at all.
   */
  it.each([
    ["cash", CASH, { LJ: 21.7, HJ: 26.0, CO: 30.6 }, TOLERANCE, TOLERANCE],
    ["tournament 100bb", MTT(100), { UTG: 65.3, UTG1: 70.6, LJ: 60.9, HJ: 64.4, CO: 69.9 }, 6, 8],
    ["tournament 20bb", MTT(20), { UTG: 74.4, UTG1: 78.0, LJ: 83.0, HJ: 82.6, CO: 82.0 }, TOLERANCE, 7],
  ] as const)("the %s BB defends an early open about as wide", (_, game, want, meanTolerance, maxTolerance) => {
    const errors = Object.entries(want).map(([opener, pct]) => Math.abs(continued(hands(game, [[opener as Position, "raise"]], "BB")) - pct));
    expect(errors.reduce((a, b) => a + b, 0) / errors.length).toBeLessThanOrEqual(meanTolerance);
    expect(Math.max(...errors)).toBeLessThanOrEqual(maxTolerance);
  });

  /** An opener out of position on a button 3-bet 4-bets far more than against a blind's; the share of its range that got there. */
  it.each([
    ["tournament 100bb", MTT(100), { UTG: 16.8, LJ: 19.4, HJ: 19.2, CO: 17.8 }],
    ["tournament 40bb", MTT(40), { UTG: 20.8, LJ: 17.6, HJ: 19.8, CO: 16.1 }],
    ["cash", CASH, { LJ: 25.4, HJ: 24.7, CO: 22.3 }],
  ] as const)("the %s opener 4-bets a button 3-bet as often", (_, game, want) => {
    for (const [opener, pct] of Object.entries(want)) {
      const seat = opener as Position;
      const opened = hands(game, [], seat);
      const answer = hands(game, [[seat, "raise"], ["BTN", "raise"]], seat);
      expect(Math.abs(ofRange(answer, opened, (h) => h.raise)[0] - pct), opener).toBeLessThanOrEqual(TOLERANCE);
    }
  });

  it("the SB answers a BB 3-bet over its tournament 100bb raise, of the range that got there", () => {
    const game = MTT(100);
    const opened = hands(game, [], "SB");
    // A deep SB raises a slice of everything it plays, so a 3-bet folds most of it.
    expectNear(ofRange(hands(game, [["SB", "raise"], ["BB", "raise"]], "SB"), opened, (h) => h.raise), [3.4, 12.9, 83.6], 5);
  });
});
