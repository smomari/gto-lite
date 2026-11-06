import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { ALL_HANDS } from "@/lib/handRange/handList";
import type { ActionNode } from "@/types/rangeData";
import type { SolveRequest } from "@/types/solveApi";
import { SolveApiError, solveNode } from "./solveClient";
import { usePreflopSolve, type SolveTable } from "./usePreflopSolve";

vi.mock("./solveClient", async (original) => ({
  ...(await original<typeof import("./solveClient")>()),
  solveNode: vi.fn(),
}));

const SB_LIMP: ActionNode = { actor: "SB", action: "call", label: "limp" };
const BB_CHECK: ActionNode = { actor: "BB", action: "call", label: "check" };
const LIMPED_POT = [
  { actor: "SB", action: "call" },
  { actor: "BB", action: "call" },
] satisfies SolveRequest["actionPath"];

function response(heroPosition: "SB" | "BB", actionPath: ActionNode[]) {
  return {
    heroPosition,
    stackDepth: 100,
    nodeId: heroPosition,
    actionPath,
    source: "heuristic-approx",
    generatedAt: new Date(0).toISOString(),
    version: "test",
    hands: ALL_HANDS.map((h) => ({ hand: h.hand, fold: 0, call: 1, raise: 0 })),
    potBb: 1.5,
    currentBetToCall: 1,
    availableActions: { fold: true, call: { label: "Call", amountBb: 0.5 }, raise: null, allin: null },
  };
}

beforeEach(() => {
  vi.mocked(solveNode).mockReset();
  vi.mocked(solveNode).mockImplementation(async ({ actionPath }) => {
    if (actionPath.length === 0) return response("SB", []) as never;
    if (actionPath.length === 1) return response("BB", [SB_LIMP]) as never;
    throw new SolveApiError({
      code: "HAND_RESOLVED",
      error: "resolved",
      reason: "action-closed",
      actionPath: [SB_LIMP, BB_CHECK],
      potBb: 2,
      committed: { SB: 1, BB: 1 },
    });
  });
});

const TABLE: SolveTable = { effectiveStackBb: 100, format: "cash-8", rake: "none", noFlopNoDrop: true, icm: "chip-ev" };

describe("usePreflopSolve", () => {
  it("hands off to the flop with the ranges seen on the way, without fetching them again", async () => {
    const { result, rerender } = renderHook(({ path }) => usePreflopSolve(TABLE, path, 0), {
      initialProps: { path: [] as SolveRequest["actionPath"] },
    });
    await waitFor(() => expect(result.current.current?.kind).toBe("success"));
    rerender({ path: LIMPED_POT.slice(0, 1) });
    await waitFor(() => expect(result.current.current?.kind).toBe("success"));
    rerender({ path: LIMPED_POT });

    await waitFor(() => expect(result.current.handoff?.matchup?.map((s) => s.seat)).toEqual(["SB", "BB"]));
    expect(solveNode).toHaveBeenCalledTimes(3);
  });

  it("fetches the ranges again at a new table, and only the ones it lacks", async () => {
    const { result, rerender } = renderHook(({ table, path }) => usePreflopSolve(table, path, 0), {
      initialProps: { table: TABLE, path: [] as SolveRequest["actionPath"] },
    });
    await waitFor(() => expect(result.current.current?.kind).toBe("success"));
    rerender({ table: { ...TABLE, effectiveStackBb: 50 }, path: LIMPED_POT });

    await waitFor(() => expect(result.current.handoff?.matchup).toHaveLength(2));
    const callsAt50 = vi.mocked(solveNode).mock.calls.filter(([request]) => request.effectiveStackBb === 50);
    expect(callsAt50.map(([request]) => request.actionPath.length).sort()).toEqual([0, 1, 2]);
  });

  it("reports a range it couldn't fetch", async () => {
    vi.mocked(solveNode).mockImplementation(async ({ actionPath }) => {
      if (actionPath.length < 2) throw new Error("Network down");
      throw new SolveApiError({
        code: "HAND_RESOLVED",
        error: "resolved",
        reason: "action-closed",
        actionPath: [SB_LIMP, BB_CHECK],
        potBb: 2,
        committed: { SB: 1, BB: 1 },
      });
    });
    const { result } = renderHook(() => usePreflopSolve(TABLE, LIMPED_POT, 0));

    await waitFor(() => expect(result.current.rangeLoadFailed).toBe(true));
    expect(result.current.handoff?.liveSeats).toHaveLength(2);
    expect(result.current.handoff?.matchup).toBeNull();
  });
});
