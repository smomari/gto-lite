import {
  DEFAULT_EXPLOITABILITY_CHECK_START_INTERVAL,
  nextExploitabilityCheck,
  type CfrRunOptions,
  type CfrSolution,
} from "../cfr";
import { engineEquityTable, riverStrengths } from "../engineBoards";
import type { ExploitabilityResult } from "../exploitability";
import { CARD_INDEX, flattenTree, type FlatTree } from "../flattenTree";
import type { EquityTable } from "../terminalEquity";
import { narrowReach } from "../treeMath";
import type { ChanceNode, DecisionNode, PostflopTreeNode } from "../treeBuilder";
import type { ComboRange } from "../types";
import type { SolverModule } from "./solverModule";

export interface NativeCfrInput {
  tree: PostflopTreeNode;
  /** The board at the tree's root; chance nodes below add their cards to it. */
  board: string[];
  heroRange: ComboRange;
  villainRange: ComboRange;
  /** The root board's equity table if the caller already built it (saves rebuilding it here). */
  rootEquityTable?: EquityTable;
  /** A faster source for other boards' tables (engine layout), e.g. RunoutEquity's turn tables; undefined falls back to building one. */
  equityTableFor?: (board: string[]) => Float32Array | undefined;
}

/**
 * Everything eng_create and the board registrations need, as plain typed
 * arrays — so a solve's helper workers can build identical engines from a
 * postMessage copy without re-deriving any of it.
 */
export interface EngineBuild {
  nodeCount: number;
  type: Uint8Array;
  childStart: Int32Array;
  childCount: Uint8Array;
  pot: Float32Array;
  committed1: Float32Array;
  committed2: Float32Array;
  aux: Int32Array;
  children: Int32Array;
  childCard: Uint8Array;
  childWeight: Float32Array;
  heroCards: Uint8Array;
  heroWeights: Float32Array;
  villainCards: Uint8Array;
  villainWeights: Float32Array;
  /** By id, as flat.tableBoards / flat.riverBoards order them. */
  equityTables: Float32Array[];
  riverStrengths: { hero: Uint32Array; villain: Uint32Array }[];
}

export function prepareEngineBuild(input: NativeCfrInput): { build: EngineBuild; flat: FlatTree } {
  const { tree, board, heroRange, villainRange } = input;
  const flat = flattenTree(tree, board);
  const cardsOf = (range: ComboRange) => Uint8Array.from(range.flatMap((c) => [CARD_INDEX[c.cards[0]], CARD_INDEX[c.cards[1]]]));
  const weightsOf = (range: ComboRange) => Float32Array.from(range, (c) => c.weight);
  const build: EngineBuild = {
    nodeCount: flat.nodeCount,
    type: flat.type,
    childStart: flat.childStart,
    childCount: flat.childCount,
    pot: flat.pot,
    committed1: flat.committed1,
    committed2: flat.committed2,
    aux: flat.aux,
    children: flat.children,
    childCard: flat.childCard,
    childWeight: flat.childWeight,
    heroCards: cardsOf(heroRange),
    heroWeights: weightsOf(heroRange),
    villainCards: cardsOf(villainRange),
    villainWeights: weightsOf(villainRange),
    equityTables: flat.tableBoards.map(
      (tableBoard) =>
        (tableBoard.length !== board.length && input.equityTableFor?.(tableBoard)) ||
        engineEquityTable(heroRange, villainRange, tableBoard, tableBoard.length === board.length ? input.rootEquityTable : undefined),
    ),
    riverStrengths: flat.riverBoards.map((riverBoard) => ({
      hero: riverStrengths(heroRange, riverBoard),
      villain: riverStrengths(villainRange, riverBoard),
    })),
  };
  return { build, flat };
}

type Typed = Uint8Array | Int32Array | Uint32Array | Float32Array;

/**
 * One engine instance in the C++ core (native/solver/engine.cpp): owns its
 * WASM memory until `dispose`. Values follow the engine's definitions —
 * unnormalized counterfactual values, exact card removal, chance nodes.
 */
export class NativeCfrEngine {
  private constructor(
    private readonly solver: SolverModule,
    private readonly handle: number,
    /** Only on the engine that maps tree nodes (the one owning the trunk); helpers' engines go by index. */
    readonly flat: FlatTree | undefined,
    readonly heroCount: number,
    readonly villainCount: number,
  ) {}

  static create(solver: SolverModule, input: NativeCfrInput): NativeCfrEngine {
    const { build, flat } = prepareEngineBuild(input);
    return NativeCfrEngine.fromBuild(solver, build, flat);
  }

  static fromBuild(solver: SolverModule, build: EngineBuild, flat?: FlatTree): NativeCfrEngine {
    const pointers: number[] = [];
    const put = (array: Typed) => {
      const ptr = solver._malloc(Math.max(array.byteLength, 4));
      solver.HEAPU8.set(new Uint8Array(array.buffer, array.byteOffset, array.byteLength), ptr);
      pointers.push(ptr);
      return ptr;
    };
    try {
      const handle = solver._eng_create(
        build.nodeCount,
        put(build.type),
        put(build.childStart),
        put(build.childCount),
        put(build.pot),
        put(build.committed1),
        put(build.committed2),
        put(build.aux),
        build.children.length,
        put(build.children),
        put(build.childCard),
        put(build.childWeight),
        build.heroWeights.length,
        put(build.heroCards),
        put(build.heroWeights),
        build.villainWeights.length,
        put(build.villainCards),
        put(build.villainWeights),
      );
      // Ids come back in registration order, matching the build's arrays.
      for (const table of build.equityTables) solver._eng_add_equity_table(handle, put(table));
      for (const { hero, villain } of build.riverStrengths) solver._eng_add_river_board(handle, put(hero), put(villain));
      return new NativeCfrEngine(solver, handle, flat, build.heroWeights.length, build.villainWeights.length);
    } finally {
      for (const ptr of pointers) solver._free(ptr);
    }
  }

  /** DCFR iterations t = firstT .. firstT + count − 1. */
  iterate(firstT: number, count: number): void {
    this.solver._eng_iterate(this.handle, firstT, count);
  }

  exploitability(): ExploitabilityResult {
    const ptr = this.solver._malloc(6 * 8);
    try {
      this.solver._eng_exploitability(this.handle, ptr);
      const [bb, percentOfPot, p1BestResponseBb, p2BestResponseBb, p1ActualBb, p2ActualBb] = this.solver.HEAPF64.slice(ptr / 8, ptr / 8 + 6);
      return { bb, percentOfPot, p1BestResponseBb, p2BestResponseBb, p1ActualBb, p2ActualBb };
    } finally {
      this.solver._free(ptr);
    }
  }

  /** [comboIndex][actionIndex], normalized — same shape as CfrSolution.getAverageStrategy. */
  averageStrategy(node: DecisionNode): number[][] {
    const index = this.flat?.decisionIndex.get(node);
    if (index === undefined) throw new Error("averageStrategy: node was not part of the solved tree");
    const actions = node.actions.length;
    const combos = node.actor === "P1" ? this.heroCount : this.villainCount;
    const ptr = this.solver._malloc(combos * actions * 4);
    try {
      this.solver._eng_average_strategy(this.handle, index, ptr);
      const flat = this.solver.HEAPF32.subarray(ptr / 4, ptr / 4 + combos * actions);
      return Array.from({ length: combos }, (_, c) => Array.from(flat.subarray(c * actions, (c + 1) * actions)));
    } finally {
      this.solver._free(ptr);
    }
  }

  /** Both players' EV at any node, arriving with these reaches (NaN when no pair reaches it). */
  nodeEv(node: PostflopTreeNode, reachP1: number[], reachP2: number[]): { p1: number; p2: number } {
    const index = this.flat?.nodeIndex.get(node);
    if (index === undefined) throw new Error("nodeEv: node was not part of the solved tree");
    const r1 = this.solver._malloc(Math.max(reachP1.length, 1) * 4);
    const r2 = this.solver._malloc(Math.max(reachP2.length, 1) * 4);
    const out = this.solver._malloc(2 * 8);
    try {
      this.solver.HEAPF32.set(reachP1, r1 / 4);
      this.solver.HEAPF32.set(reachP2, r2 / 4);
      this.solver._eng_node_ev(this.handle, index, r1, r2, out);
      return { p1: this.solver.HEAPF64[out / 8], p2: this.solver.HEAPF64[out / 8 + 1] };
    } finally {
      this.solver._free(r1);
      this.solver._free(r2);
      this.solver._free(out);
    }
  }

  // ---------------------------------------------------------- split solves (splitSolve.ts)

  /** Makes this engine one part of a split solve — see eng_partition. */
  partition(leafNodes: number[], ownTrunk: boolean, ownedSlots: number[]): void {
    const leaves = this.solver._malloc(Math.max(leafNodes.length, 1) * 4);
    const owned = this.solver._malloc(Math.max(ownedSlots.length, 1) * 4);
    try {
      this.solver.HEAP32.set(leafNodes, leaves / 4);
      this.solver.HEAP32.set(ownedSlots, owned / 4);
      this.solver._eng_partition(this.handle, leafNodes.length, leaves, ownTrunk ? 1 : 0, ownedSlots.length, owned);
    } finally {
      this.solver._free(leaves);
      this.solver._free(owned);
    }
  }

  /** Row `slot` × (heroCount + villainCount) of the exchange buffers, as views into WASM memory (re-take after any allocation). */
  exchangeIn(leafCount: number): Float32Array {
    const ptr = this.solver._eng_exchange_in(this.handle);
    return this.solver.HEAPF32.subarray(ptr / 4, ptr / 4 + leafCount * (this.heroCount + this.villainCount));
  }

  exchangeOut(leafCount: number): Float32Array {
    const ptr = this.solver._eng_exchange_out(this.handle);
    return this.solver.HEAPF32.subarray(ptr / 4, ptr / 4 + leafCount * (this.heroCount + this.villainCount));
  }

  trunkForward(t: number): void {
    this.solver._eng_trunk_forward(this.handle, t);
  }

  leavesIterate(t: number): void {
    this.solver._eng_leaves_iterate(this.handle, t);
  }

  trunkBackward(t: number): void {
    this.solver._eng_trunk_backward(this.handle, t);
  }

  trunkEvalForward(p: 0 | 1): void {
    this.solver._eng_trunk_eval_forward(this.handle, p);
  }

  leavesEvaluate(p: 0 | 1, bestResponse: boolean): void {
    this.solver._eng_leaves_evaluate(this.handle, p, bestResponse ? 1 : 0);
  }

  /** Player p's root values after the leaves' evaluation is in exchangeOut. */
  trunkEvalBackward(p: 0 | 1, bestResponse: boolean): Float32Array {
    const count = p === 0 ? this.heroCount : this.villainCount;
    const ptr = this.solver._malloc(Math.max(count, 1) * 4);
    try {
      this.solver._eng_trunk_eval_backward(this.handle, p, bestResponse ? 1 : 0, ptr);
      return this.solver.HEAPF32.slice(ptr / 4, ptr / 4 + count);
    } finally {
      this.solver._free(ptr);
    }
  }

  pairMass(): number {
    return this.solver._eng_pair_mass(this.handle);
  }

  /** Both players' EV at a trunk chance node, from the last EV-mode evaluation of each (NaN when unreached). */
  trunkChanceEv(node: ChanceNode): { p1: number; p2: number } {
    const index = this.flat?.nodeIndex.get(node);
    if (index === undefined) throw new Error("trunkChanceEv: node was not part of the solved tree");
    const out = this.solver._malloc(2 * 8);
    try {
      this.solver._eng_trunk_chance_ev(this.handle, index, out);
      return { p1: this.solver.HEAPF64[out / 8], p2: this.solver.HEAPF64[out / 8 + 1] };
    } finally {
      this.solver._free(out);
    }
  }

  dispose(): void {
    this.solver._eng_destroy(this.handle);
  }
}

export type NativeCfrOptions = Pick<CfrRunOptions, "maxIterations" | "targetExploitabilityPercent" | "checkIntervalIterations">;
export type CfrProgress = (done: number, total: number, exploitabilityPercent?: number) => void;

/** What a solve loop drives: iterations, and an exploitability measurement of the current average strategy. */
export interface CfrStepper {
  iterate(firstT: number, count: number): void;
  exploitability(): ExploitabilityResult;
}

/**
 * The stopping rule shared by every C++ solve (same as runCfr's): periodic
 * exploitability checks on the shared schedule, early stop at the target, and
 * the final exploitability always measured.
 */
export function runSolveLoop(
  stepper: CfrStepper,
  options: NativeCfrOptions,
  onProgress?: CfrProgress,
): { iterations: number; finalExploitability: ExploitabilityResult } {
  const { maxIterations, targetExploitabilityPercent, checkIntervalIterations } = options;
  const progressInterval = Math.max(1, Math.floor(maxIterations / 50));
  let nextCheck = targetExploitabilityPercent === undefined ? Infinity : (checkIntervalIterations ?? DEFAULT_EXPLOITABILITY_CHECK_START_INTERVAL);
  let done = 0;
  let measured: ExploitabilityResult | undefined;
  while (done < maxIterations) {
    const nextProgress = (Math.floor(done / progressInterval) + 1) * progressInterval;
    const until = Math.min(maxIterations, nextCheck, nextProgress);
    stepper.iterate(done + 1, until - done);
    done = until;
    if (done >= nextCheck) {
      measured = stepper.exploitability();
      nextCheck = nextExploitabilityCheck(done);
      onProgress?.(done, maxIterations, measured.percentOfPot);
      if (measured.percentOfPot <= targetExploitabilityPercent!) break;
      measured = done === maxIterations ? measured : undefined;
    } else {
      onProgress?.(done, maxIterations);
    }
  }
  return { iterations: done, finalExploitability: measured ?? stepper.exploitability() };
}

/** Each root-street chance node's EV for both players — what continuing the line is worth (null when no pair reaches it). */
export type NextStreetEv = Map<ChanceNode, { heroEvBb: number; villainEvBb: number }>;

/**
 * A finished C++ solve whose engine(s) are still alive: strategies are read
 * on demand (cached per node), so a multi-street tree never has to be copied
 * into JavaScript whole. The caller must `dispose` it.
 */
export interface NativeSolveSession {
  solution: CfrSolution;
  /** EV at each chance node that ends the root street, under the final average strategy. */
  nextStreetEv(): NextStreetEv;
  dispose(): void;
}

/** A CfrSolution reading strategies lazily from `engine`. */
export function lazySolution(engine: NativeCfrEngine, iterations: number, finalExploitability: ExploitabilityResult): CfrSolution {
  const strategies = new Map<DecisionNode, number[][]>();
  return {
    iterations,
    finalExploitability,
    getAverageStrategy(node) {
      let strategy = strategies.get(node);
      if (!strategy) {
        strategy = engine.averageStrategy(node);
        strategies.set(node, strategy);
      }
      return strategy;
    },
  };
}

/** The chance nodes that end the root street, with the average-strategy reaches arriving at each. */
export function rootStreetChanceNodes(
  tree: PostflopTreeNode,
  solution: CfrSolution,
  heroWeights: number[],
  villainWeights: number[],
): { node: ChanceNode; reachP1: number[]; reachP2: number[] }[] {
  const found: { node: ChanceNode; reachP1: number[]; reachP2: number[] }[] = [];
  (function walk(node: PostflopTreeNode, reachP1: number[], reachP2: number[]) {
    if (node.type === "chance") {
      found.push({ node, reachP1, reachP2 });
      return;
    }
    if (node.type !== "decision") return;
    const isP1Acting = node.actor === "P1";
    const strategy = solution.getAverageStrategy(node);
    node.actions.forEach(({ child }, a) => {
      walk(child, isP1Acting ? narrowReach(reachP1, strategy, a) : reachP1, isP1Acting ? reachP2 : narrowReach(reachP2, strategy, a));
    });
  })(tree, heroWeights, villainWeights);
  return found;
}

/** Keeps finite EVs only: NaN marks a line neither player takes, which has no EV to show. */
export function finiteEvs(entries: { node: ChanceNode; ev: { p1: number; p2: number } }[]): NextStreetEv {
  const result: NextStreetEv = new Map();
  for (const { node, ev } of entries) {
    if (Number.isFinite(ev.p1) && Number.isFinite(ev.p2)) result.set(node, { heroEvBb: ev.p1, villainEvBb: ev.p2 });
  }
  return result;
}

/** A C++ solve on one engine — the whole tree on this thread. */
export function solveNativeSession(
  solver: SolverModule,
  input: NativeCfrInput,
  options: NativeCfrOptions,
  onProgress?: CfrProgress,
): NativeSolveSession {
  const engine = NativeCfrEngine.create(solver, input);
  try {
    const { iterations, finalExploitability } = runSolveLoop(engine, options, onProgress);
    const solution = lazySolution(engine, iterations, finalExploitability);
    return {
      solution,
      nextStreetEv: () =>
        finiteEvs(
          rootStreetChanceNodes(input.tree, solution, input.heroRange.map((c) => c.weight), input.villainRange.map((c) => c.weight)).map(
            ({ node, reachP1, reachP2 }) => ({ node, ev: engine.nodeEv(node, reachP1, reachP2) }),
          ),
        ),
      dispose: () => engine.dispose(),
    };
  } catch (err) {
    engine.dispose();
    throw err;
  }
}

/** solveNativeSession for a tree small enough to copy out whole: every strategy is read, then the engine is released. */
export function runNativeCfr(solver: SolverModule, input: NativeCfrInput, options: NativeCfrOptions, onProgress?: CfrProgress): CfrSolution {
  const session = solveNativeSession(solver, input, options, onProgress);
  try {
    const nodes: DecisionNode[] = [];
    (function walk(node: PostflopTreeNode) {
      if (node.type === "decision") {
        nodes.push(node);
        node.actions.forEach(({ child }) => walk(child));
      } else if (node.type === "chance") {
        node.children.forEach(({ child }) => walk(child));
      }
    })(input.tree);
    for (const node of nodes) session.solution.getAverageStrategy(node);
    return session.solution;
  } finally {
    session.dispose();
  }
}
