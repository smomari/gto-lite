"use client";

import { useSyncExternalStore } from "react";
import { MESSAGES, type Locale, type Messages } from "./messages";

const STORAGE_KEY = "gtoLite.locale";
const DEFAULT_LOCALE: Locale = "en";

let current: Locale | null = null;
const listeners = new Set<() => void>();

/** The remembered choice; without one, Korean for a browser set to Korean. */
export function pickLocale(stored: string | null, browserLanguage: string | undefined): Locale {
  if (stored === "ko" || stored === "en") return stored;
  return browserLanguage?.toLowerCase().startsWith("ko") ? "ko" : DEFAULT_LOCALE;
}

function readStored(): Locale {
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private modes may refuse storage: go by the browser's language.
  }
  return pickLocale(stored, window.navigator.language);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Locale {
  current ??= readStored();
  return current;
}

/** The server never knows the choice, so it renders English and the client switches after hydration. */
const getServerSnapshot = () => DEFAULT_LOCALE;

/** Remembered in this browser; every component using the hooks below re-renders. */
export function setLocale(locale: Locale) {
  current = locale;
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Private modes may refuse storage: the choice then lasts until reload.
  }
  listeners.forEach((listener) => listener());
}

export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useMessages(): Messages {
  return MESSAGES[useLocale()];
}
