"use client";

import { useEffect } from "react";
import { setLocale, useLocale, useMessages } from "@/lib/i18n/locale";
import type { Locale } from "@/lib/i18n/messages";

const OPTIONS: { locale: Locale; label: string }[] = [
  { locale: "en", label: "EN" },
  { locale: "ko", label: "한" },
];

/** Switches the whole page, and the AI explanation, between English and Korean without touching the hand. */
export function LanguageToggle() {
  const locale = useLocale();
  const t = useMessages();

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <div role="group" aria-label={t.language} className="flex overflow-hidden rounded border border-line-strong text-sm">
      {OPTIONS.map((option) => (
        <button
          key={option.locale}
          type="button"
          aria-pressed={locale === option.locale}
          onClick={() => setLocale(option.locale)}
          className={`px-2 py-1 pointer-coarse:min-h-9 ${
            locale === option.locale ? "bg-raised font-medium text-ink" : "text-ink-muted hover:bg-raised hover:text-ink"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
