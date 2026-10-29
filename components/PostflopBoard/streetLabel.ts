import { streetForBoardLength, type PostflopStreet } from "@/lib/postflopSolver/betAbstraction";

export type StreetLabel = "Flop" | "Turn" | "River";

const STREET_LABELS: Record<PostflopStreet, StreetLabel> = { flop: "Flop", turn: "Turn", river: "River" };

export function streetLabelForBoardLength(boardLength: number): StreetLabel {
  return STREET_LABELS[streetForBoardLength(boardLength)];
}

/** The river (5-card board) is the last street — nothing more to deal after it. */
export function hasNextStreet(boardLength: number): boolean {
  return boardLength < 5;
}
