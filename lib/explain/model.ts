import { streamText } from "ai";
import { explainInstructions, explainPrompt, type ExplainLanguage } from "./prompt";
import type { HandSummary } from "./summarySchema";
import type { ExplanationPart } from "./handlers";

/**
 * Through Vercel AI Gateway. Gemini 2.5 Flash, because Gateway's free credits
 * cover it: $0.30 / $2.50 per million input / output tokens, about $0.006 an
 * explanation. The free tier doesn't offer Claude models.
 */
export const EXPLAIN_MODEL = "google/gemini-2.5-flash";
/** Covers the explanation (about 1,500 tokens) and low-effort thinking, which bills as output. */
const MAX_OUTPUT_TOKENS = 3000;
const TIMEOUT_MS = 60_000;

export function streamExplanation(summary: HandSummary, language: ExplainLanguage, options: { model?: string; abortSignal?: AbortSignal } = {}) {
  return streamText({
    model: options.model ?? EXPLAIN_MODEL,
    instructions: explainInstructions(language),
    prompt: explainPrompt(summary),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    reasoning: "low",
    timeout: TIMEOUT_MS,
    abortSignal: options.abortSignal,
  });
}

/** The model's stream as the parts the explain handler reads. A reply cut off at the token limit is still a complete one. */
export async function* explanationParts(summary: HandSummary, language: ExplainLanguage, abortSignal: AbortSignal): AsyncGenerator<ExplanationPart> {
  const result = streamExplanation(summary, language, { abortSignal });
  for await (const part of result.stream) {
    if (part.type === "text-delta") yield { type: "text", text: part.text };
    else if (part.type === "error") yield { type: "error", error: part.error };
    else if (part.type === "abort") return;
    else if (part.type === "finish") yield { type: "finish", complete: part.finishReason === "stop" || part.finishReason === "length" };
  }
}
