import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { HandFrequency, Position } from "@/types/rangeData";

export interface RfiPositionExport {
  openSizeBb: number;
  threeBetSizeBb: number;
  exploitabilityPercentOfPot: number;
  iterations: number;
  hands: HandFrequency[];
}

export interface RfiExportFile {
  version: string;
  generatedAt: string;
  stackDepth: number;
  cfr: { maxIterations: number; targetExploitabilityPercent: number };
  positions: Partial<Record<Position, RfiPositionExport>>;
}

// Resolved from process.cwd() for the same reason loadEquityMatrix.ts is —
// Next.js's bundler relocates this module's compiled output for the
// /api/solve route, breaking any path computed relative to __dirname. The path
// stays inline in readFileSync for its file tracing, too.

let cached: RfiExportFile | null = null;

/** Node-only: reads the offline-generated RFI solver-export data from disk. */
export function loadRfiExport(): RfiExportFile {
  if (cached) return cached;
  cached = JSON.parse(readFileSync(resolve(process.cwd(), "data/preflop/rfi-100bb.json"), "utf-8")) as RfiExportFile;
  return cached;
}
