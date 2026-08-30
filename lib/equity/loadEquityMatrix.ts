import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type EquityMatrix = Record<string, Record<string, number>>;

// Resolved from process.cwd() rather than __dirname: Next.js's bundler relocates
// this module's compiled output for the /api/solve route, which breaks any path
// computed relative to __dirname at runtime. process.cwd() is reliably the
// project root under `next dev`, `next start`, and Vercel's serverless runtime,
// same as it is when this file is loaded directly by tsx scripts or Vitest.
const DEFAULT_PATH = resolve(process.cwd(), "data/equity/allin-equity-169x169.json");

let cached: EquityMatrix | null = null;

/**
 * Node-only: reads the offline-generated 169x169 all-in equity matrix from disk.
 * Used by the solve engine (via app/api/solve/route.ts) and offline generation
 * scripts — never imported by client components, since the raw matrix does not
 * need to ship to the browser.
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
