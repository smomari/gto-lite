import type { ReactNode } from "react";

/** A full-page message for when there is no page to show: an error or a missing address. */
export function ErrorNotice({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-start justify-center gap-3 px-4">
      <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
      <p className="text-base text-ink-muted">{body}</p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </main>
  );
}

export const PRIMARY_ACTION = "rounded bg-accent px-3 py-1.5 text-sm font-medium text-canvas pointer-coarse:min-h-11";
export const SECONDARY_ACTION = "rounded px-3 py-1.5 text-sm text-ink-muted hover:bg-raised hover:text-ink pointer-coarse:min-h-11";
