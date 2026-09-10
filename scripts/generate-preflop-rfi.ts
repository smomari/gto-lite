import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Position } from "../types/rangeData";
import { loadEquityMatrix } from "../lib/equity/loadEquityMatrix";
import { solveRfi } from "../lib/preflopSolver/solveRfi";

const OUTPUT_PATH = resolve(__dirname, "../data/preflop/rfi-100bb.json");
const STACK_BB = 100;
// No real-time UX constraint offline, so a much tighter target than the
// postflop solver's UX-driven 0.5% default, with a generous safety cap.
const MAX_ITERATIONS = 50000;
const TARGET_EXPLOITABILITY_PERCENT = 0.1;
const VERSION = "3.0.0";

/**
 * Only SB is a genuinely correct 2-player reduction (SB opening into BB is
 * a real heads-up spot once everyone else has folded). For every other
 * opening seat, "opener vs BB" collapses away the other 5-6 live threats
 * that make real RFI ranges tight — both a joint-CFR solve and a
 * fixed-BB-best-response variant were tried for the other positions and
 * both produced unrealistically wide (66-100% open) ranges. See the
 * Phase C-1 plan doc's writeup. Do not add more positions here without
 * first solving that modeling problem (true multiway, or a "field
 * pressure" proxy) — solveActiveSeat's routing falls back to the existing
 * heuristic for any position not present in this file's `positions`.
 */
const RFI_EXPORT_POSITIONS: Position[] = ["SB"];

function main() {
  const matrix = loadEquityMatrix();
  const positions: Record<string, unknown> = {};

  for (const seat of RFI_EXPORT_POSITIONS) {
    console.log(`Solving ${seat} RFI @ ${STACK_BB}bb...`);
    const result = solveRfi(
      seat,
      matrix,
      STACK_BB,
      { maxIterations: MAX_ITERATIONS, targetExploitabilityPercent: TARGET_EXPLOITABILITY_PERCENT },
      (done, total, pct) => {
        if (done % 5000 === 0 || done === total) {
          console.log(`  ${seat}: ${done}/${total} iters${pct !== undefined ? `, exploitability ${pct.toFixed(3)}%` : ""}`);
        }
      },
    );
    // Combo-weighted, not a raw ">0 hands" count — CFR convergence noise
    // leaves virtually every hand with some nonzero (but often ~1e-6)
    // probability, so a plain count would misleadingly read as "169/169".
    const openCombos = result.hands.reduce((s, h) => {
      const combos = h.hand.length === 2 ? 6 : h.hand.endsWith("s") ? 4 : 12;
      return s + combos * h.raise;
    }, 0);
    console.log(
      `  ${seat}: ${result.iterations} iters, exploitability ${result.exploitability.percentOfPot.toFixed(4)}% of pot, ${((100 * openCombos) / 1326).toFixed(1)}% combo-weighted open`,
    );
    positions[seat] = {
      openSizeBb: result.openSizeBb,
      threeBetSizeBb: result.threeBetSizeBb,
      exploitabilityPercentOfPot: result.exploitability.percentOfPot,
      iterations: result.iterations,
      hands: result.hands,
    };
  }

  const output = {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    stackDepth: STACK_BB,
    cfr: { maxIterations: MAX_ITERATIONS, targetExploitabilityPercent: TARGET_EXPLOITABILITY_PERCENT },
    positions,
  };

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`Wrote ${OUTPUT_PATH}`);
}

main();
