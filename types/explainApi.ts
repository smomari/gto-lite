/** GET /api/explain: what the requester has left today. */
export type ExplainStatus =
  | { available: false }
  | { available: true; remaining: number; limit: number; globalExhausted: boolean };

export type ExplainErrorCode = "UNAVAILABLE" | "BOT" | "TOO_LARGE" | "INVALID_SUMMARY" | "USER_LIMIT" | "GLOBAL_LIMIT" | "MODEL_ERROR";

export interface ExplainErrorBody {
  error: string;
  code: ExplainErrorCode;
  /** On a limit error: what the requester has left. */
  remaining?: number;
}

/**
 * POST /api/explain answers 200 with the explanation as streamed plain text,
 * and these headers.
 */
export const EXPLAIN_REMAINING_HEADER = "x-explain-remaining";
/** "hit" when the explanation came from the cache and used no explanation. */
export const EXPLAIN_CACHE_HEADER = "x-explain-cache";
