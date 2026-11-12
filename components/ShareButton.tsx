"use client";

import { useEffect, useState } from "react";
import { HEADER_LINK } from "@/components/AppHeader";
import { useMessages } from "@/lib/i18n/locale";

const NOTICE_MS = 2000;

/**
 * Hands out the page's address, which always describes the spot on screen:
 * the share sheet on a touch device that has one, the clipboard elsewhere.
 */
export function ShareButton() {
  const t = useMessages();
  const [notice, setNotice] = useState<"copied" | "failed" | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  async function share() {
    const url = window.location.href;
    if (typeof navigator.share === "function" && window.matchMedia?.("(pointer: coarse)").matches) {
      // Closing the sheet rejects too, and needs no message.
      await navigator.share({ title: document.title, url }).catch(() => {});
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setNotice("copied");
    } catch {
      setNotice("failed");
    }
  }

  const label = notice === "copied" ? t.header.copied : notice === "failed" ? t.header.copyFailed : t.header.share;
  return (
    <button type="button" onClick={share} title={t.header.shareTitle} aria-label={notice ? undefined : t.header.shareTitle} className={HEADER_LINK}>
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 fill-none stroke-current" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
        <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" />
      </svg>
      <span role="status" className={notice ? "" : "hidden sm:inline"}>
        {label}
      </span>
    </button>
  );
}
