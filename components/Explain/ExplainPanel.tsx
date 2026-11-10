"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { ExplainApiError, fetchExplainStatus, requestExplanation } from "@/lib/apiClient/explainClient";
import type { HandSummary } from "@/lib/explain/summarySchema";
import type { ExplainStatus } from "@/types/explainApi";

interface ExplainPanelProps {
  /** Built only when asked for: it walks every street's ranges. */
  buildSummary: () => HandSummary;
}

type RunState =
  | { kind: "idle" }
  | { kind: "streaming"; text: string }
  | { kind: "done"; text: string }
  | { kind: "error"; message: string; text: string };

/** `**bold**` inside a line of the model's markdown. */
function inline(line: string): ReactNode {
  return line.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={i} className="font-semibold text-ink">{part}</strong> : <Fragment key={i}>{part}</Fragment>));
}

/** The model's "## Section" headings and paragraphs; anything fancier shows as plain text. */
function ExplanationText({ text }: { text: string }) {
  // A heading is its own line; the lines between headings and blank lines are one paragraph.
  const blocks: { heading: boolean; text: string }[] = [];
  let paragraph: string[] = [];
  const endParagraph = () => {
    if (paragraph.length) blocks.push({ heading: false, text: paragraph.join(" ") });
    paragraph = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("#")) {
      endParagraph();
      blocks.push({ heading: true, text: line.replace(/^#+\s*/, "") });
    } else if (line) paragraph.push(line.replace(/^[-*]\s+/, ""));
    else endParagraph();
  }
  endParagraph();

  return (
    <div className="flex flex-col gap-2 text-sm leading-relaxed text-ink-muted">
      {blocks.map((block, i) =>
        block.heading ? (
          <h3 key={i} className="mt-1 text-xs font-semibold text-ink">
            {block.text}
          </h3>
        ) : (
          <p key={i}>{inline(block.text)}</p>
        ),
      )}
    </div>
  );
}

function errorMessage(err: unknown): string {
  if (err instanceof ExplainApiError) {
    if (err.code === "USER_LIMIT") return "You've used today's AI explanations. They reset at midnight KST.";
    if (err.code === "GLOBAL_LIMIT") return "Today's AI explanations are all used up. Try again tomorrow.";
    return err.message;
  }
  return "The explanation was cut off. Try again.";
}

/** "Explain with AI" for a finished hand: today's allowance, the streamed explanation, and its caveat. */
export function ExplainPanel({ buildSummary }: ExplainPanelProps) {
  const [status, setStatus] = useState<ExplainStatus | null>(null);
  const [run, setRun] = useState<RunState>({ kind: "idle" });
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchExplainStatus(controller.signal)
      .then(setStatus)
      .catch(() => {
        if (!controller.signal.aborted) setStatus({ available: false });
      });
    return () => {
      controller.abort();
      controllerRef.current?.abort();
    };
  }, []);

  if (!status?.available) return null;

  const outOfExplanations = status.remaining <= 0 || status.globalExhausted;

  async function explain() {
    if (!status?.available) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setRun({ kind: "streaming", text: "" });
    let latest = "";
    try {
      const result = await requestExplanation(
        buildSummary(),
        (text) => {
          latest = text;
          setRun({ kind: "streaming", text });
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setRun({ kind: "done", text: result.text });
      if (result.remaining !== null) setStatus({ ...status, remaining: result.remaining });
    } catch (err) {
      if (controller.signal.aborted) return;
      setRun({ kind: "error", message: errorMessage(err), text: latest });
      if (err instanceof ExplainApiError && err.remaining !== undefined) {
        setStatus({ ...status, remaining: err.remaining, globalExhausted: err.code === "GLOBAL_LIMIT" || status.globalExhausted });
      }
    }
  }

  const showButton = run.kind === "idle" || run.kind === "error";
  return (
    <section data-testid="explain-panel" className="flex flex-col gap-2 border-t border-line pt-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs font-semibold text-ink">AI explanation</p>
        {showButton && (
          <button
            type="button"
            onClick={explain}
            disabled={outOfExplanations}
            className="rounded border border-line-strong px-3 py-1 text-sm text-ink hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:min-h-11"
          >
            {run.kind === "error" ? "Try again" : "Explain this hand"}
          </button>
        )}
        <span className="text-xs text-ink-faint">
          {status.globalExhausted
            ? "Closed for today"
            : `${status.remaining}/${status.limit} left today · the same line again is free`}
        </span>
      </div>
      {run.kind === "streaming" && !run.text && <p className="text-xs text-ink-faint">Writing…</p>}
      {run.kind !== "idle" && run.text && <ExplanationText text={run.text} />}
      {run.kind === "error" && (
        <p role="alert" className="text-xs text-[#d98a82]">
          {run.message}
        </p>
      )}
      {run.kind !== "idle" && (
        <p className="text-xs text-ink-faint">Written by AI from this hand&apos;s solver numbers. It can misread them or be wrong.</p>
      )}
    </section>
  );
}
