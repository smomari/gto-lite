import { RANKS } from "./handList";

/**
 * 13x13 grid of hand labels following the standard convention:
 * diagonal = pairs, upper triangle (row < col) = suited, lower triangle = offsuit.
 */
export function buildHandMatrix(): string[][] {
  const grid: string[][] = [];
  for (let i = 0; i < RANKS.length; i++) {
    const row: string[] = [];
    for (let j = 0; j < RANKS.length; j++) {
      if (i === j) {
        row.push(`${RANKS[i]}${RANKS[i]}`);
      } else if (i < j) {
        row.push(`${RANKS[i]}${RANKS[j]}s`);
      } else {
        row.push(`${RANKS[j]}${RANKS[i]}o`);
      }
    }
    grid.push(row);
  }
  return grid;
}

export const HAND_MATRIX: string[][] = buildHandMatrix();
