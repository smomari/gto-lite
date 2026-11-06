"use client";

import { useEffect, useState } from "react";
import { solveNode, SolveApiError } from "./solveClient";
import { actionPathKey, resolvePostflopHandoff, type PostflopHandoff } from "@/lib/solveEngine/postflopHandoff";
import type { GameFormatId } from "@/lib/solveEngine/gameFormat";
import type { IcmId } from "@/lib/solveEngine/icm";
import type { RakeId } from "@/lib/solveEngine/rake";
import type { ActionNode, Position } from "@/types/rangeData";
import type { SolveRequest, SolveResponse } from "@/types/solveApi";

/** Everything about the table a request depends on besides its action path. */
export interface SolveTable {
  effectiveStackBb: number;
  format: GameFormatId;
  rake: RakeId;
  noFlopNoDrop: boolean;
  icm: IcmId;
}

type RequestPath = SolveRequest["actionPath"];

export type PreflopResult =
  | { kind: "success"; data: SolveResponse }
  | {
      kind: "resolved";
      reason: string;
      actionPath: ActionNode[];
      potBb: number;
      committed: Partial<Record<Position, number>>;
    }
  | { kind: "error"; message: string };

/** The responses seen at this table, keyed by the path that led to each (see actionPathKey). */
interface RangeCache {
  tableKey: string;
  byPath: Record<string, SolveResponse>;
}

function withResponses(cache: RangeCache, tableKey: string, responses: SolveResponse[]): RangeCache {
  const byPath = cache.tableKey === tableKey ? cache.byPath : {};
  return { tableKey, byPath: { ...byPath, ...Object.fromEntries(responses.map((data) => [actionPathKey(data.actionPath), data])) } };
}

/**
 * The preflop node for `requestPath` at this table, and once the hand
 * resolves, the postflop hand-off built from every decision's response seen
 * so far: each live seat's range entering the flop is the response at its
 * last decision. Only a table change invalidates those; undo/replay just
 * looks up a different path. Ranges a quick action skipped over are fetched
 * on their own. Bumping `attempt` sends the same requests again.
 */
export function usePreflopSolve(table: SolveTable, requestPath: RequestPath, attempt: number) {
  const tableKey = JSON.stringify(table);
  const requestKey = JSON.stringify({ table, requestPath, attempt });
  const [result, setResult] = useState<(PreflopResult & { key: string }) | null>(null);
  const [ranges, setRanges] = useState<RangeCache>({ tableKey, byPath: {} });
  const [failedRangesKey, setFailedRangesKey] = useState<string | null>(null);

  useEffect(() => {
    const request = JSON.parse(requestKey) as { table: SolveTable; requestPath: RequestPath };
    const requestTableKey = JSON.stringify(request.table);
    const controller = new AbortController();

    solveNode({ ...request.table, actionPath: request.requestPath }, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setResult({ key: requestKey, kind: "success", data });
        setRanges((prev) => withResponses(prev, requestTableKey, [data]));
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err instanceof SolveApiError && err.code === "HAND_RESOLVED") {
          setResult({
            key: requestKey,
            kind: "resolved",
            reason: err.reason ?? "resolved",
            actionPath: err.actionPath ?? [],
            potBb: err.potBb ?? 0,
            committed: err.committed ?? {},
          });
        } else {
          setResult({
            key: requestKey,
            kind: "error",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      });

    return () => controller.abort();
  }, [requestKey]);

  const loading = result === null || result.key !== requestKey;
  const current: PreflopResult | null = !loading && result ? result : null;
  const rangeByPathKey = ranges.tableKey === tableKey ? ranges.byPath : {};
  const handoff: PostflopHandoff | null =
    current?.kind === "resolved"
      ? resolvePostflopHandoff(current.actionPath, current.committed, table.effectiveStackBb, rangeByPathKey)
      : null;

  // A quick action skips seats' decisions, so their ranges never arrived with a response.
  const missingPaths =
    handoff?.liveSeats.flatMap((s) => (!s.hands && s.decisionPath ? [s.decisionPath.map(({ actor, action }) => ({ actor, action }))] : [])) ?? [];
  const missingRangesKey = missingPaths.length ? JSON.stringify({ table, requestKey, missingPaths }) : null;
  const rangeLoadFailed = missingRangesKey !== null && failedRangesKey === missingRangesKey;

  useEffect(() => {
    if (!missingRangesKey) return;
    const missing = JSON.parse(missingRangesKey) as { table: SolveTable; missingPaths: RequestPath[] };
    const missingTableKey = JSON.stringify(missing.table);
    const controller = new AbortController();
    Promise.all(missing.missingPaths.map((actionPath) => solveNode({ ...missing.table, actionPath }, controller.signal)))
      .then((responses) => {
        if (controller.signal.aborted) return;
        setRanges((prev) => withResponses(prev, missingTableKey, responses));
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailedRangesKey(missingRangesKey);
      });
    return () => controller.abort();
  }, [missingRangesKey]);

  return { loading, current, handoff, rangeLoadFailed };
}
