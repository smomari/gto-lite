"use client";

import Link from "next/link";
import { useState } from "react";
import { useMessages } from "@/lib/i18n/locale";

const STORAGE_KEY = "gtoLite.hintDismissed";

function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** One line on how the page works, until it's closed once in this browser. Rendered on the client only. */
export function FirstVisitHint() {
  const t = useMessages();
  const [dismissed, setDismissed] = useState(wasDismissed);
  if (dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // It stays closed until reload.
    }
  }

  return (
    <p className="flex items-center gap-2 rounded border border-line bg-surface px-3 py-1.5 text-sm text-ink-muted">
      <span className="min-w-0 flex-1">
        {t.hint.text}{" "}
        <Link href="/about" className="text-accent underline-offset-2 hover:underline">
          {t.hint.learnMore}
        </Link>
      </span>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t.hint.dismiss}
        className="shrink-0 rounded px-2 py-0.5 text-ink-muted hover:bg-raised hover:text-ink pointer-coarse:min-h-9"
      >
        ✕
      </button>
    </p>
  );
}
