import Anthropic from "@anthropic-ai/sdk";
import { explainInstructions, explainPrompt, type ExplainLanguage } from "./prompt";
import type { HandSummary } from "./summarySchema";
import type { ExplanationPart } from "./handlers";

/**
 * Claude Haiku 5.5 through the Claude API (ANTHROPIC_API_KEY): $0.10 / $0.50
 * per million input / output tokens, about a tenth of a cent an explanation.
 */
export const EXPLAIN_MODEL = "claude-haiku-5-5";
/** The explanation runs to about 1,500 tokens. */
const MAX_OUTPUT_TOKENS = 3000;
const TIMEOUT_MS = 60_000;

export function streamExplanation(summary: HandSummary, language: ExplainLanguage, options: { model?: string; abortSignal?: AbortSignal } = {}) {
  // Made per call: the client reads the key when it's built, and a server without one should fail the request, not the import.
  return new Anthropic().messages.stream(
    {
      model: options.model ?? EXPLAIN_MODEL,
      system: explainInstructions(language, summary.streets.map((s) => s.street)),
      messages: [{ role: "user", content: explainPrompt(summary) }],
      max_tokens: MAX_OUTPUT_TOKENS,
      thinking: { type: "disabled" },
    },
    { timeout: TIMEOUT_MS, signal: options.abortSignal },
  );
}

/** The model's stream as the parts the explain handler reads. A reply cut off at the token limit is still a complete one. */
export async function* explanationParts(summary: HandSummary, language: ExplainLanguage, abortSignal: AbortSignal): AsyncGenerator<ExplanationPart> {
  try {
    let stopReason: Anthropic.StopReason | null = null;
    for await (const event of streamExplanation(summary, language, { abortSignal })) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") yield { type: "text", text: event.delta.text };
      else if (event.type === "message_delta") stopReason = event.delta.stop_reason;
    }
    yield { type: "finish", complete: stopReason === "end_turn" || stopReason === "max_tokens" };
  } catch (error) {
    if (error instanceof Anthropic.APIUserAbortError || abortSignal.aborted) return;
    yield { type: "error", error };
  }
}
