import type { ExploitabilityResult } from "../exploitability";
import {
  finiteEvs,
  lazySolution,
  NativeCfrEngine,
  prepareEngineBuild,
  rootStreetChanceNodes,
  runSolveLoop,
  type CfrProgress,
  type CfrStepper,
  type EngineBuild,
  type NativeCfrInput,
  type NativeCfrOptions,
  type NativeSolveSession,
} from "./engine";
import type { SolverModule } from "./solverModule";

/**
 * One tree solved across several engines (see eng_partition): the engine on
 * this thread owns the trunk — the root street, down to the chance nodes that
 * end it — and a share of the leaves under them; LeafRunners own the rest
 * (other workers, each with its own engine and regrets). Every iteration is
 * trunk forward → all leaves at once → trunk backward, trading only reaches
 * and values; results are the same as one engine solving the whole tree.
 */

export const NODE_CHANCE = 5;
export const NODE_DECISION_P2 = 1;

export type LeafCommand = { kind: "iterate"; t: number } | { kind: "evaluate"; p: 0 | 1; bestResponse: boolean };

/** Leaves solved somewhere other than the trunk's engine. */
export interface LeafRunner {
  /** Starts this runner's leaves on `command`, reading their rows of the trunk's exchangeIn. */
  start(command: LeafCommand, input: Float32Array): void;
  /** Waits for what `start` began and writes this runner's rows into the trunk's exchangeOut. */
  finish(output: Float32Array): void;
  dispose(): void;
}

/** Leaf roots in slot order: the children of the chance nodes that end the root street. */
export function findLeafRoots(build: EngineBuild): number[] {
  const leaves: number[] = [];
  (function walk(node: number) {
    const start = build.childStart[node], count = build.childCount[node];
    if (build.type[node] === NODE_CHANCE) {
      for (let c = 0; c < count; c++) leaves.push(build.children[start + c]);
    } else if (build.type[node] <= NODE_DECISION_P2) {
      for (let c = 0; c < count; c++) walk(build.children[start + c]);
    }
  })(0);
  return leaves;
}

function subtreeSize(build: EngineBuild, node: number): number {
  let size = 1;
  const start = build.childStart[node], count = build.childCount[node];
  for (let c = 0; c < count; c++) size += subtreeSize(build, build.children[start + c]);
  return size;
}

/**
 * Leaf slots split into `parts` groups of similar total subtree size, biggest
 * leaves first onto the lightest group. Group 0 also runs the trunk, so it
 * starts out loaded with the trunk's size.
 */
export function assignLeafSlots(build: EngineBuild, leafNodes: number[], parts: number): number[][] {
  const sizes = leafNodes.map((node) => subtreeSize(build, node));
  const trunkSize = build.nodeCount - sizes.reduce((s, x) => s + x, 0);
  const groups = Array.from({ length: parts }, () => [] as number[]);
  const loads = groups.map((_, g) => (g === 0 ? trunkSize : 0));
  const order = sizes.map((_, slot) => slot).sort((a, b) => sizes[b] - sizes[a]);
  for (const slot of order) {
    const lightest = loads.indexOf(Math.min(...loads));
    groups[lightest].push(slot);
    loads[lightest] += sizes[slot];
  }
  for (const group of groups) group.sort((a, b) => a - b);
  return groups;
}

/** Copies the rows of `slots` (each `width` floats) from one exchange buffer to another. */
export function copyRows(from: Float32Array, to: Float32Array, slots: number[], width: number): void {
  for (const slot of slots) to.set(from.subarray(slot * width, (slot + 1) * width), slot * width);
}

/** Leaves on another engine in this same thread — the synchronous runner (tests, and the protocol's reference). */
export function inProcessLeafRunner(solver: SolverModule, build: EngineBuild, leafNodes: number[], slots: number[]): LeafRunner {
  const engine = NativeCfrEngine.fromBuild(solver, build);
  engine.partition(leafNodes, false, slots);
  const width = engine.heroCount + engine.villainCount;
  return {
    start(command, input) {
      copyRows(input, engine.exchangeIn(leafNodes.length), slots, width);
      if (command.kind === "iterate") engine.leavesIterate(command.t);
      else engine.leavesEvaluate(command.p, command.bestResponse);
    },
    finish(output) {
      copyRows(engine.exchangeOut(leafNodes.length), output, slots, width);
    },
    dispose: () => engine.dispose(),
  };
}

export type LeafRunnerFactory = (build: EngineBuild, leafNodes: number[], groups: number[][]) => LeafRunner[];

/** A C++ solve with its leaves spread over `parts` engines: this thread's and one per runner `makeRunners` returns. */
export function solveSplitSession(
  solver: SolverModule,
  input: NativeCfrInput,
  options: NativeCfrOptions,
  onProgress: CfrProgress | undefined,
  parts: number,
  makeRunners: LeafRunnerFactory,
): NativeSolveSession {
  const { build, flat } = prepareEngineBuild(input);
  const leafNodes = findLeafRoots(build);
  const groups = assignLeafSlots(build, leafNodes, parts);
  const main = NativeCfrEngine.fromBuild(solver, build, flat);
  let runners: LeafRunner[] = [];
  const dispose = () => {
    for (const runner of runners) runner.dispose();
    main.dispose();
  };

  try {
    main.partition(leafNodes, true, groups[0]);
    runners = makeRunners(build, leafNodes, groups.slice(1));
    const leafCount = leafNodes.length;

    /** One trunk-to-leaves round: other runners start, this thread does its own leaves, then everyone's values come back. */
    const roundTrip = (command: LeafCommand, ownLeaves: () => void) => {
      const exchangeIn = main.exchangeIn(leafCount);
      for (const runner of runners) runner.start(command, exchangeIn);
      ownLeaves();
      const exchangeOut = main.exchangeOut(leafCount);
      for (const runner of runners) runner.finish(exchangeOut);
    };

    const pairs = main.pairMass();
    const startPot = build.pot[0] - build.committed1[0] - build.committed2[0];
    const ev = (p: 0 | 1, bestResponse: boolean) => {
      main.trunkEvalForward(p);
      roundTrip({ kind: "evaluate", p, bestResponse }, () => main.leavesEvaluate(p, bestResponse));
      const root = main.trunkEvalBackward(p, bestResponse);
      const weights = p === 0 ? build.heroWeights : build.villainWeights;
      let sum = 0;
      for (let i = 0; i < root.length; i++) sum += weights[i] * root[i];
      return pairs > 0 ? sum / pairs : 0;
    };

    const stepper: CfrStepper = {
      iterate(firstT, count) {
        for (let t = firstT; t < firstT + count; t++) {
          main.trunkForward(t);
          roundTrip({ kind: "iterate", t }, () => main.leavesIterate(t));
          main.trunkBackward(t);
        }
      },
      // Same arithmetic as eng_exploitability. The EV-mode passes also leave each chance node's values for nextStreetEv.
      exploitability(): ExploitabilityResult {
        const p1ActualBb = ev(0, false);
        const p1BestResponseBb = ev(0, true);
        const p2ActualBb = ev(1, false);
        const p2BestResponseBb = ev(1, true);
        const bb = (p1BestResponseBb - p1ActualBb + (p2BestResponseBb - p2ActualBb)) / 2;
        return { bb, percentOfPot: startPot > 0 ? (bb / startPot) * 100 : 0, p1BestResponseBb, p2BestResponseBb, p1ActualBb, p2ActualBb };
      },
    };

    const { iterations, finalExploitability } = runSolveLoop(stepper, options, onProgress);
    const solution = lazySolution(main, iterations, finalExploitability);
    return {
      solution,
      // runSolveLoop's last measurement was of the final strategy, so the trunk still holds its EV-mode values.
      nextStreetEv: () =>
        finiteEvs(
          rootStreetChanceNodes(input.tree, solution, Array.from(build.heroWeights), Array.from(build.villainWeights)).map(({ node }) => ({
            node,
            ev: main.trunkChanceEv(node),
          })),
        ),
      dispose,
    };
  } catch (err) {
    dispose();
    throw err;
  }
}
