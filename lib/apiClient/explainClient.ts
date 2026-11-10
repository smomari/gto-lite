import type { HandSummary } from "@/lib/explain/summarySchema";
import { EXPLAIN_CACHE_HEADER, EXPLAIN_REMAINING_HEADER, type ExplainErrorBody, type ExplainStatus } from "@/types/explainApi";

export class ExplainApiError extends Error {
  code: ExplainErrorBody["code"];
  remaining?: number;

  constructor(body: ExplainErrorBody) {
    super(body.error);
    this.name = "ExplainApiError";
    this.code = body.code;
    this.remaining = body.remaining;
  }
}

export async function fetchExplainStatus(signal?: AbortSignal): Promise<ExplainStatus> {
  const res = await fetch("/api/explain", { signal });
  if (!res.ok) return { available: false };
  return res.json();
}

/** Streams the explanation of `summary` into `onText` (the text so far), and resolves once it's complete. */
export async function requestExplanation(
  summary: HandSummary,
  onText: (textSoFar: string) => void,
  signal?: AbortSignal,
): Promise<{ text: string; remaining: number | null; cached: boolean }> {
  const res = await fetch("/api/explain", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(summary),
    signal,
  });
  if (!res.ok || !res.body) {
    const body: ExplainErrorBody = await res
      .json()
      .catch(() => ({ error: `Request failed (${res.status})`, code: "MODEL_ERROR" as const }));
    throw new ExplainApiError(body);
  }

  const remainingHeader = res.headers.get(EXPLAIN_REMAINING_HEADER);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let text = "";
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    text += chunk.value;
    onText(text);
  }
  return { text, remaining: remainingHeader === null ? null : Number(remainingHeader), cached: res.headers.get(EXPLAIN_CACHE_HEADER) === "hit" };
}
