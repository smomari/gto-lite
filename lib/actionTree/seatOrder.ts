import type { Position } from "@/types/rangeData";

export const SEAT_ORDER: Position[] = ["UTG", "UTG1", "LJ", "HJ", "CO", "BTN", "SB", "BB"];

export function seatIndex(pos: Position): number {
  const idx = SEAT_ORDER.indexOf(pos);
  if (idx === -1) throw new Error(`Unknown seat: ${pos}`);
  return idx;
}
