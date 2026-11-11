import {
  EXPLAIN_CACHE_HEADER,
  EXPLAIN_REMAINING_HEADER,
  type ExplainErrorBody,
  type ExplainStatus,
} from "@/types/explainApi";
import { EXPLAIN_ID_COOKIE, EXPLAIN_ID_MAX_AGE_SECONDS, hashedClientIp, newExplainId, verifyExplainId } from "./identity";
import { explainLanguage, type ExplainLanguage } from "./prompt";
import { handSummarySchema, type HandSummary } from "./summarySchema";
import {
  USER_DAILY_LIMIT,
  cacheExplanation,
  cachedExplanation,
  explanationCacheKey,
  refundExplanation,
  reserveExplanation,
  usageStatus,
  type ExplainStore,
  type Requester,
} from "./usage";

/** A summary is about 6KB; this leaves room without letting a request grow the prompt much. */
export const MAX_REQUEST_BYTES = 20_000;

export type ExplanationPart = { type: "text"; text: string } | { type: "error"; error: unknown } | { type: "finish"; complete: boolean };

export interface ExplainDeps {
  /** Null when Redis or the signing secret isn't configured: the feature is off. */
  store: ExplainStore | null;
  secret: string | undefined;
  model: string;
  now: () => Date;
  isBot: () => Promise<boolean>;
  explain: (summary: HandSummary, language: ExplainLanguage, abortSignal: AbortSignal) => AsyncIterable<ExplanationPart>;
  logError: (message: string, error: unknown) => void;
}

function errorResponse(status: number, body: ExplainErrorBody, headers?: HeadersInit): Response {
  return Response.json(body, { status, headers });
}

function cookieValue(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
}

/** The requester, and the cookie to set when they arrived without a valid one. */
function identify(request: Request, secret: string): { requester: Requester; setCookie?: string } {
  const ipHash = hashedClientIp(request.headers, secret);
  const known = verifyExplainId(cookieValue(request, EXPLAIN_ID_COOKIE), secret);
  if (known) return { requester: { userId: known, ipHash } };
  const { id, cookie } = newExplainId(secret);
  return {
    requester: { userId: id, ipHash },
    setCookie: `${EXPLAIN_ID_COOKIE}=${cookie}; Path=/api/explain; Max-Age=${EXPLAIN_ID_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`,
  };
}

function withCookie(headers: Record<string, string>, setCookie: string | undefined): Headers {
  const result = new Headers(headers);
  if (setCookie) result.append("set-cookie", setCookie);
  return result;
}

export function createExplainHandlers(deps: ExplainDeps) {
  const configured = (): { store: ExplainStore; secret: string } | null =>
    deps.store && deps.secret ? { store: deps.store, secret: deps.secret } : null;

  async function GET(request: Request): Promise<Response> {
    const config = configured();
    if (!config) return Response.json({ available: false } satisfies ExplainStatus);
    const { requester, setCookie } = identify(request, config.secret);
    const status = await usageStatus(config.store, requester, deps.now());
    const body: ExplainStatus = { available: true, limit: USER_DAILY_LIMIT, ...status };
    return Response.json(body, { headers: withCookie({ "cache-control": "no-store" }, setCookie) });
  }

  /**
   * Explains one hand. A cached explanation of the same line is free; a new
   * one takes one of today's explanations, given back if the model fails
   * before finishing.
   */
  async function POST(request: Request): Promise<Response> {
    const config = configured();
    if (!config) return errorResponse(503, { error: "AI explanations aren't set up on this server", code: "UNAVAILABLE" });
    if (await deps.isBot()) return errorResponse(403, { error: "Request looked automated", code: "BOT" });

    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_REQUEST_BYTES) return errorResponse(413, { error: "Hand summary is too large", code: "TOO_LARGE" });
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > MAX_REQUEST_BYTES) {
      return errorResponse(413, { error: "Hand summary is too large", code: "TOO_LARGE" });
    }
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      return errorResponse(400, { error: "Body must be JSON", code: "INVALID_SUMMARY" });
    }
    const parsed = handSummarySchema.safeParse(parsedJson);
    if (!parsed.success) return errorResponse(400, { error: "Not a valid hand summary", code: "INVALID_SUMMARY" });
    const summary = parsed.data;

    const { store } = config;
    const { requester, setCookie } = identify(request, config.secret);
    const language = explainLanguage(new URL(request.url).searchParams.get("lang"));
    const cacheKey = explanationCacheKey(summary, language, deps.model);

    const cached = await cachedExplanation(store, cacheKey);
    if (cached !== null) {
      const status = await usageStatus(store, requester, deps.now());
      return new Response(cached, {
        headers: withCookie(
          { "content-type": "text/plain; charset=utf-8", [EXPLAIN_CACHE_HEADER]: "hit", [EXPLAIN_REMAINING_HEADER]: String(status.remaining) },
          setCookie,
        ),
      });
    }

    const reserved = await reserveExplanation(store, requester, deps.now());
    if (!reserved.ok) {
      const body: ExplainErrorBody =
        reserved.reason === "user-limit"
          ? { error: "You've used today's explanations", code: "USER_LIMIT", remaining: 0 }
          : { error: "Today's explanations are all used up", code: "GLOBAL_LIMIT", remaining: reserved.status.remaining };
      return errorResponse(429, body, withCookie({}, setCookie));
    }
    const { reservation } = reserved;

    // Wait for the first text before answering, so a model that fails outright gets a proper error, not a cut-off stream.
    const controller = new AbortController();
    const parts = deps.explain(summary, language, controller.signal)[Symbol.asyncIterator]();
    let text = "";
    let settled = false;
    const fail = async (error: unknown) => {
      if (settled) return;
      settled = true;
      deps.logError("explain: model failed", error);
      await refundExplanation(store, reservation);
    };
    const finish = async (complete: boolean) => {
      if (settled) return;
      settled = true;
      if (complete && text) await cacheExplanation(store, cacheKey, text);
      else await refundExplanation(store, reservation);
    };

    let first: ExplanationPart | undefined;
    try {
      for (let next = await parts.next(); !next.done; next = await parts.next()) {
        if (next.value.type !== "text" || next.value.text) {
          first = next.value;
          break;
        }
      }
    } catch (error) {
      first = { type: "error", error };
    }
    if (first?.type !== "text") {
      if (first?.type === "error") await fail(first.error);
      else await fail(new Error("model returned no text"));
      return errorResponse(502, { error: "The AI couldn't write an explanation; it wasn't counted", code: "MODEL_ERROR" }, withCookie({}, setCookie));
    }
    text = first.text;

    const body = new ReadableStream<string>({
      start(stream) {
        stream.enqueue(first.text);
      },
      async pull(stream) {
        try {
          const next = await parts.next();
          if (next.done) {
            await finish(false);
            stream.close();
          } else if (next.value.type === "text") {
            text += next.value.text;
            stream.enqueue(next.value.text);
          } else if (next.value.type === "finish") {
            await finish(next.value.complete);
            stream.close();
          } else {
            await fail(next.value.error);
            stream.error(new Error("explanation failed"));
          }
        } catch (error) {
          await fail(error);
          stream.error(error);
        }
      },
      // The reader left: stop the model. What it already wrote was paid for, so nothing is given back.
      cancel() {
        settled = true;
        controller.abort();
      },
    });

    return new Response(body.pipeThrough(new TextEncoderStream()), {
      headers: withCookie(
        {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
          [EXPLAIN_REMAINING_HEADER]: String(reservation.status.remaining),
        },
        setCookie,
      ),
    });
  }

  return { GET, POST };
}
