import { NativeCfrEngine, type EngineBuild } from "../wasm/engine";
import { copyRows, type LeafCommand, type LeafRunner, type LeafRunnerFactory } from "../wasm/splitSolve";
import type { SolverModule } from "../wasm/solverModule";

/**
 * A split solve's leaves on helper workers (one C++ engine each), driven from
 * the solver worker through shared memory: the solver copies every helper
 * leaf's exchangeIn row into `input`, writes the command, bumps GEN and wakes
 * the helpers; each computes its own leaves and adds to DONE; the solver,
 * after its own leaves, waits for DONE and copies the helpers' `output` rows
 * back. Same rows and arithmetic as inProcessLeafRunner, so the same results.
 */

const GEN = 0;
const DONE = 1;
const READY = 2;
const FAILED = 3;
const CMD = 4;
const ARG_T = 5;
const ARG_P = 6;
const ARG_BEST_RESPONSE = 7;
const CONTROL_SLOTS = 8;

const CMD_ITERATE = 1;
const CMD_EVALUATE = 2;
const CMD_STOP = 3;

/** Helpers that don't report in by then (e.g. no WASM SIMD) mean the solve runs on one thread instead. */
const HELPER_READY_TIMEOUT_MS = 5000;

export interface LeafHelperSetup {
  build: EngineBuild;
  leafNodes: number[];
  slots: number[];
  control: SharedArrayBuffer;
  input: SharedArrayBuffer;
  output: SharedArrayBuffer;
}

/** The helpers couldn't be set up; the caller should solve on its own thread. */
export class LeafHelpersUnavailableError extends Error {}

function waitUntil(control: Int32Array, index: number, target: number, timeoutMs: number): boolean {
  const deadline = Date.now() + timeoutMs;
  for (let value = Atomics.load(control, index); value < target; value = Atomics.load(control, index)) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return false;
    Atomics.wait(control, index, value, remaining);
  }
  return true;
}

/** A helper's whole life: build its engine, report in, then run its leaves every time GEN moves, until STOP. */
export function runLeafHelper(setup: LeafHelperSetup, solver: SolverModule | null): void {
  const control = new Int32Array(setup.control);
  if (!solver) {
    Atomics.add(control, FAILED, 1);
    Atomics.notify(control, READY);
    return;
  }
  const engine = NativeCfrEngine.fromBuild(solver, setup.build);
  engine.partition(setup.leafNodes, false, setup.slots);
  const leafCount = setup.leafNodes.length;
  const width = engine.heroCount + engine.villainCount;
  const input = new Float32Array(setup.input);
  const output = new Float32Array(setup.output);

  let gen = Atomics.load(control, GEN);
  Atomics.add(control, READY, 1);
  Atomics.notify(control, READY);
  for (;;) {
    Atomics.wait(control, GEN, gen);
    gen = Atomics.load(control, GEN);
    const command = Atomics.load(control, CMD);
    if (command === CMD_STOP) break;
    copyRows(input, engine.exchangeIn(leafCount), setup.slots, width);
    if (command === CMD_ITERATE) engine.leavesIterate(Atomics.load(control, ARG_T));
    else engine.leavesEvaluate(Atomics.load(control, ARG_P) as 0 | 1, Atomics.load(control, ARG_BEST_RESPONSE) === 1);
    copyRows(engine.exchangeOut(leafCount), output, setup.slots, width);
    Atomics.add(control, DONE, 1);
    Atomics.notify(control, DONE);
  }
  engine.dispose();
}

/** Runners over helper workers already connected through `ports` (one per helper), for solveSplitSession. */
export function workerLeafRunners(ports: readonly MessagePort[]): LeafRunnerFactory {
  return (build, leafNodes, groups) => {
    const helpers = groups.length;
    const width = build.heroWeights.length + build.villainWeights.length;
    const floats = leafNodes.length * width * Float32Array.BYTES_PER_ELEMENT;
    const setupBase = {
      build,
      leafNodes,
      control: new SharedArrayBuffer(CONTROL_SLOTS * Int32Array.BYTES_PER_ELEMENT),
      input: new SharedArrayBuffer(Math.max(floats, 4)),
      output: new SharedArrayBuffer(Math.max(floats, 4)),
    };
    groups.forEach((slots, i) => ports[i].postMessage({ ...setupBase, slots } satisfies LeafHelperSetup));

    const control = new Int32Array(setupBase.control);
    const ready = waitUntil(control, READY, helpers, HELPER_READY_TIMEOUT_MS) && Atomics.load(control, FAILED) === 0;
    if (!ready) {
      Atomics.store(control, CMD, CMD_STOP);
      Atomics.add(control, GEN, 1);
      Atomics.notify(control, GEN);
      throw new LeafHelpersUnavailableError("leaf helpers did not start");
    }

    const helperSlots = groups.flat();
    const input = new Float32Array(setupBase.input);
    const output = new Float32Array(setupBase.output);
    const runner: LeafRunner = {
      start(command: LeafCommand, exchangeIn: Float32Array) {
        copyRows(exchangeIn, input, helperSlots, width);
        if (command.kind === "iterate") {
          Atomics.store(control, CMD, CMD_ITERATE);
          Atomics.store(control, ARG_T, command.t);
        } else {
          Atomics.store(control, CMD, CMD_EVALUATE);
          Atomics.store(control, ARG_P, command.p);
          Atomics.store(control, ARG_BEST_RESPONSE, command.bestResponse ? 1 : 0);
        }
        Atomics.store(control, DONE, 0);
        Atomics.add(control, GEN, 1);
        Atomics.notify(control, GEN);
      },
      finish(exchangeOut: Float32Array) {
        waitUntil(control, DONE, helpers, Number.POSITIVE_INFINITY);
        copyRows(output, exchangeOut, helperSlots, width);
      },
      dispose() {
        Atomics.store(control, CMD, CMD_STOP);
        Atomics.add(control, GEN, 1);
        Atomics.notify(control, GEN);
      },
    };
    return [runner];
  };
}
