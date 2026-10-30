import { opponentCardWeights, showdownEquities, type ShowdownLayout } from "./showdownBatch";

/**
 * One solve's showdown batch: CFR writes each showdown node's reach into
 * `heroReach` / `villainReach` (node-major, `[node * combos + combo]`), calls
 * `evaluate()`, and reads equities back from `heroEquity` / `villainEquity`
 * (`[node * combos + combo]`). How the work is done — one thread or several
 * sharing these buffers — is the executor's business.
 */
export interface ShowdownRun {
  heroReach: Float64Array;
  villainReach: Float64Array;
  heroEquity: Float64Array;
  villainEquity: Float64Array;
  evaluate(): void;
  /** Releases memory the run holds outside the JS heap (the WASM executor's context). */
  dispose?(): void;
}

export interface ShowdownExecutor {
  prepare(heroLayout: ShowdownLayout, villainLayout: ShowdownLayout, nodeCount: number): ShowdownRun;
}

export const singleThreadShowdown: ShowdownExecutor = {
  prepare(heroLayout, villainLayout, nodeCount) {
    const heroCount = heroLayout.rows;
    const villainCount = villainLayout.rows;
    const run: ShowdownRun = {
      heroReach: new Float64Array(nodeCount * heroCount),
      villainReach: new Float64Array(nodeCount * villainCount),
      heroEquity: new Float64Array(nodeCount * heroCount),
      villainEquity: new Float64Array(nodeCount * villainCount),
      evaluate() {
        const villainWeights = opponentCardWeights(heroLayout, run.villainReach, nodeCount);
        const heroWeights = opponentCardWeights(villainLayout, run.heroReach, nodeCount);
        showdownEquities(heroLayout, run.villainReach, villainWeights, nodeCount, 0, heroCount, run.heroEquity);
        showdownEquities(villainLayout, run.heroReach, heroWeights, nodeCount, 0, villainCount, run.villainEquity);
      },
    };
    return run;
  },
};
