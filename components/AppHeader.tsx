"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { SITE_NAME } from "@/lib/siteUrl";
import { useMessages } from "@/lib/i18n/locale";

const NAME = "shrink-0 text-xl font-semibold tracking-tight text-ink";

/**
 * The bar across the top of every page. `homeLink` makes the name a way back
 * to the solver. On the solver itself `onHome` makes it a button that starts
 * over with the settings kept; a link there would reload them from storage
 * and drop what the address says.
 */
export function AppHeader({ homeLink, onHome, children }: { homeLink?: boolean; onHome?: () => void; children?: ReactNode }) {
  const t = useMessages();
  return (
    <header className="flex items-center justify-between gap-2 border-b border-line pb-2">
      {homeLink ? (
        <Link href="/" className={NAME} aria-label={`${SITE_NAME} — ${t.header.home}`}>
          {SITE_NAME}
        </Link>
      ) : onHome ? (
        <button type="button" onClick={onHome} className={`${NAME} cursor-pointer`} aria-label={`${SITE_NAME} — ${t.header.startOver}`}>
          {SITE_NAME}
        </button>
      ) : (
        <span className={NAME}>{SITE_NAME}</span>
      )}
      <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">{children}</div>
    </header>
  );
}

export const HEADER_LINK =
  "flex shrink-0 items-center gap-1.5 rounded border border-line-strong px-2 py-1 text-sm text-ink-muted hover:bg-raised hover:text-ink pointer-coarse:min-h-9";

export function AboutLink() {
  const t = useMessages();
  return (
    <Link href="/about" className={HEADER_LINK} aria-label={t.header.about}>
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 fill-none stroke-current" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5M12 8h.01" />
      </svg>
      <span className="hidden sm:inline">{t.header.about}</span>
    </Link>
  );
}
