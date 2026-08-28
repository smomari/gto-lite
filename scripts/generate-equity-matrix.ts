import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { winningOddsForTable } from "poker-evaluator";
import { ALL_HANDS } from "../lib/handRange/handList";
import { dealTwoHands } from "../lib/equity/assignCards";

const CYCLES = Number(process.env.EQUITY_CYCLES ?? 5000);
const OUTPUT_PATH = resolve(__dirname, "../data/equity/allin-equity-169x169.json");

/**
 * poker-evaluator's Monte Carlo odds functions call the global Math.random()
 * directly with no seed hook, so we swap in a seeded PRNG for the duration of
 * this script to make the generated matrix reproducible across runs.
 */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function equityFromOdds(winRate: number, splitRates: { rate: number; ways: number }[]): number {
  const splitEquity = splitRates.reduce((sum, s) => sum + s.rate / s.ways, 0);
  return winRate + splitEquity;
}

function main() {
  const originalRandom = Math.random;
  Math.random = mulberry32(42);

  const matrix: Record<string, Record<string, number>> = {};
  for (const h of ALL_HANDS) matrix[h.hand] = {};

  const total = (ALL_HANDS.length * (ALL_HANDS.length + 1)) / 2;
  let done = 0;
  const startedAt = Date.now();

  for (let i = 0; i < ALL_HANDS.length; i++) {
    const handA = ALL_HANDS[i];
    for (let j = i; j < ALL_HANDS.length; j++) {
      const handB = ALL_HANDS[j];
      const { cardsA, cardsB } = dealTwoHands(handA, handB);
      const odds = winningOddsForTable([cardsA, cardsB], [], 2, CYCLES);
      const equityA = equityFromOdds(odds.players[0].winRate, odds.players[0].splitRates);

      matrix[handA.hand][handB.hand] = equityA;
      matrix[handB.hand][handA.hand] = 1 - equityA;

      done++;
      if (done % 2000 === 0 || done === total) {
        const elapsedSec = (Date.now() - startedAt) / 1000;
        console.log(`  ${done}/${total} pairs (${elapsedSec.toFixed(1)}s)`);
      }
    }
  }

  Math.random = originalRandom;

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(matrix));
  console.log(`Wrote ${OUTPUT_PATH}`);
}

main();
