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
import type { DecisionNode, PostflopTreeNode } from "../treeBuilder";
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
}

type Typed = Uint8Array | Int32Array | Uint32Array | Float32Array;

/**
 * One solve in the C++ engine (native/solver/engine.cpp): owns the engine's
 * WASM memory until `dispose`. Values follow the engine's definitions —
 * unnormalized counterfactual values, exact card removal, chance nodes.
 */
export class NativeCfrEngine {
  private constructor(
    private readonly solver: SolverModule,
    private readonly handle: number,
    readonly flat: FlatTree,
    private readonly heroCount: number,
    private readonly villainCount: number,
  ) {}

  static create(solver: SolverModule, input: NativeCfrInput): NativeCfrEngine {
    const { tree, board, heroRange, villainRange } = input;
    const flat = flattenTree(tree, board);
    const pointers: number[] = [];
    const put = (array: Typed) => {
      const ptr = solver._malloc(Math.max(array.byteLength, 4));
      solver.HEAPU8.set(new Uint8Array(array.buffer, array.byteOffset, array.byteLength), ptr);
      pointers.push(ptr);
      return ptr;
    };
    const cardsOf = (range: ComboRange) => Uint8Array.from(range.flatMap((c) => [CARD_INDEX[c.cards[0]], CARD_INDEX[c.cards[1]]]));
    const weightsOf = (range: ComboRange) => Float32Array.from(range, (c) => c.weight);

    try {
      const handle = solver._eng_create(
        flat.nodeCount,
        put(flat.type),
        put(flat.childStart),
        put(flat.childCount),
        put(flat.pot),
        put(flat.committed1),
        put(flat.committed2),
        put(flat.aux),
        flat.children.length,
        put(flat.children),
        put(flat.childCard),
        put(flat.childWeight),
        heroRange.length,
        put(cardsOf(heroRange)),
        put(weightsOf(heroRange)),
        villainRange.length,
        put(cardsOf(villainRange)),
        put(weightsOf(villainRange)),
      );
      // Ids come back in registration order, matching flat.tableBoards / flat.riverBoards.
      for (const tableBoard of flat.tableBoards) {
        const prebuilt = tableBoard.length === board.length ? input.rootEquityTable : undefined;
        solver._eng_add_equity_table(handle, put(engineEquityTable(heroRange, villainRange, tableBoard, prebuilt)));
      }
      for (const riverBoard of flat.riverBoards) {
        solver._eng_add_river_board(handle, put(riverStrengths(heroRange, riverBoard)), put(riverStrengths(villainRange, riverBoard)));
      }
      return new NativeCfrEngine(solver, handle, flat, heroRange.length, villainRange.length);
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
    const index = this.flat.decisionIndex.get(node);
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

  dispose(): void {
    this.solver._eng_destroy(this.handle);
  }
}

/**
 * The C++ counterpart of runCfr: same stopping rule (periodic exploitability
 * checks on the shared schedule, early stop at the target) and the same
 * CfrSolution shape. The engine is released before returning — every decision
 * node's average strategy is read out first, and the final exploitability is
 * always included.
 */
export function runNativeCfr(
  solver: SolverModule,
  input: NativeCfrInput,
  options: Pick<CfrRunOptions, "maxIterations" | "targetExploitabilityPercent" | "checkIntervalIterations">,
  onProgress?: (done: number, total: number, exploitabilityPercent?: number) => void,
): CfrSolution {
  const { maxIterations, targetExploitabilityPercent, checkIntervalIterations } = options;
  const engine = NativeCfrEngine.create(solver, input);
  try {
    const progressInterval = Math.max(1, Math.floor(maxIterations / 50));
    let nextCheck = targetExploitabilityPercent === undefined ? Infinity : (checkIntervalIterations ?? DEFAULT_EXPLOITABILITY_CHECK_START_INTERVAL);
    let done = 0;
    let measured: ExploitabilityResult | undefined;
    while (done < maxIterations) {
      const nextProgress = (Math.floor(done / progressInterval) + 1) * progressInterval;
      const until = Math.min(maxIterations, nextCheck, nextProgress);
      engine.iterate(done + 1, until - done);
      done = until;
      if (done >= nextCheck) {
        measured = engine.exploitability();
        nextCheck = nextExploitabilityCheck(done);
        onProgress?.(done, maxIterations, measured.percentOfPot);
        if (measured.percentOfPot <= targetExploitabilityPercent!) break;
        measured = done === maxIterations ? measured : undefined;
      } else {
        onProgress?.(done, maxIterations);
      }
    }

    const finalExploitability = measured ?? engine.exploitability();
    const strategies = new Map<DecisionNode, number[][]>();
    for (const node of engine.flat.decisionIndex.keys()) strategies.set(node, engine.averageStrategy(node));
    return {
      iterations: done,
      finalExploitability,
      getAverageStrategy(node) {
        const strategy = strategies.get(node);
        if (!strategy) throw new Error("getAverageStrategy: node was not part of the solved tree");
        return strategy;
      },
    };
  } finally {
    engine.dispose();
  }
}
