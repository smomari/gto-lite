import type { Position } from "@/types/rangeData";

export const SEAT_ORDER: Position[] = ["UTG", "UTG1", "LJ", "HJ", "CO", "BTN", "SB", "BB"];

export function seatIndex(pos: Position): number {
  const idx = SEAT_ORDER.indexOf(pos);
  if (idx === -1) throw new Error(`Unknown seat: ${pos}`);
  return idx;
}

// Postflop acting order differs from preflop: action starts left of the
// button (SB first) every street, since BTN holds position through the
// whole hand. Sorting live seats by `seatIndex` (preflop order) to decide
// who's OOP is wrong whenever BTN/SB/BB is one of the two live seats.
export const POSTFLOP_SEAT_ORDER: Position[] = ["SB", "BB", "UTG", "UTG1", "LJ", "HJ", "CO", "BTN"];

export function postflopSeatIndex(pos: Position): number {
  const idx = POSTFLOP_SEAT_ORDER.indexOf(pos);
  if (idx === -1) throw new Error(`Unknown seat: ${pos}`);
  return idx;
}
