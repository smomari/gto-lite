import { describe, expect, it } from "vitest";
import { SEAT_ORDER } from "@/lib/actionTree/seatOrder";
import { loadEquityMatrix } from "@/lib/equity/loadEquityMatrix";
import { HAND_BY_LABEL, TOTAL_COMBOS } from "@/lib/handRange/handList";
import type { ActionType, HandFrequency, Position } from "@/types/rangeData";
import { TOURNAMENT_8, type GameFormat } from "./gameFormat";
import { NO_RAKE_SETTINGS, type RakeSettings } from "./rake";
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
  it("the SB answers a BB 3-bet over its tournament 100bb raise, of the range that got there", () => {
    const game = MTT(100);
    const opened = hands(game, [], "SB");
    // A deep SB raises a slice of everything it plays, so a 3-bet folds most of it.
    expectNear(ofRange(hands(game, [["SB", "raise"], ["BB", "raise"]], "SB"), opened, (h) => h.raise), [3.4, 12.9, 83.6], 5);
  });
});
