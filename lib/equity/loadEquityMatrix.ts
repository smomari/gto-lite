import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type EquityMatrix = Record<string, Record<string, number>>;

const DEFAULT_PATH = resolve(__dirname, "../../data/equity/allin-equity-169x169.json");

let cached: EquityMatrix | null = null;

/**
 * Node-only: reads the offline-generated 169x169 all-in equity matrix from disk.
 * Only used by generation scripts (nashSolver, heuristicRanges) — never imported
 * by client components, since the raw matrix does not need to ship to the browser.
 */
export function loadEquityMatrix(path: string = DEFAULT_PATH): EquityMatrix {
  if (cached) return cached;
  const raw = readFileSync(path, "utf-8");
  cached = JSON.parse(raw) as EquityMatrix;
  return cached;
}

export function equityOf(matrix: EquityMatrix, handA: string, handB: string): number {
  const row = matrix[handA];
  if (!row || !(handB in row)) {
    throw new Error(`No equity entry for ${handA} vs ${handB}`);
  }
  return row[handB];
}
