/** Shared range-vector primitives for walks over a solved tree (checkdownEquity.ts, wasm/engine.ts). */

export function weightedAverage(values: number[], weights: number[]): number {
  let weighted = 0;
  let totalWeight = 0;
  for (let i = 0; i < values.length; i++) {
    weighted += values[i] * weights[i];
    totalWeight += weights[i];
  }
  return totalWeight > 0 ? weighted / totalWeight : 0;
}

/** The acting player's reach after taking `actionIndex`: each combo's reach times its probability of that action. */
export function narrowReach(reach: number[], strategy: number[][], actionIndex: number): number[] {
  return reach.map((r, c) => r * strategy[c][actionIndex]);
}
