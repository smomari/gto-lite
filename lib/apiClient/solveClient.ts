import type { SolveErrorBody, SolveRequest, SolveResponse } from "@/types/solveApi";

export class SolveApiError extends Error {
  code: SolveErrorBody["code"];
  reason?: SolveErrorBody["reason"];
  actionPath?: SolveErrorBody["actionPath"];
  potBb?: SolveErrorBody["potBb"];

  constructor(body: SolveErrorBody) {
    super(body.error);
    this.name = "SolveApiError";
    this.code = body.code;
    this.reason = body.reason;
    this.actionPath = body.actionPath;
    this.potBb = body.potBb;
  }
}

export async function solveNode(params: SolveRequest, signal?: AbortSignal): Promise<SolveResponse> {
  const res = await fetch("/api/solve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
    signal,
  });
  if (!res.ok) {
    const body: SolveErrorBody = await res.json();
    throw new SolveApiError(body);
  }
  return res.json();
}
