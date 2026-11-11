import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { setLocale } from "@/lib/i18n/locale";
import { LanguageToggle } from "./LanguageToggle";

// Node's own localStorage shadows jsdom's and is unusable without a file, so each test gets a plain one.
let stored: Map<string, string>;
beforeEach(() => {
  stored = new Map();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value) },
  });
});

afterEach(() => {
  act(() => setLocale("en"));
});

describe("LanguageToggle", () => {
  it("starts in English", () => {
    render(<LanguageToggle />);
    expect(screen.getByRole("button", { name: "EN" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "한" })).toHaveAttribute("aria-pressed", "false");
  });

  it("switches to Korean, remembers it, and sets the page language", () => {
    render(<LanguageToggle />);
    fireEvent.click(screen.getByRole("button", { name: "한" }));
    expect(screen.getByRole("button", { name: "한" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("group", { name: "언어" })).toBeInTheDocument();
    expect(stored.get("gtoLite.locale")).toBe("ko");
    expect(document.documentElement.lang).toBe("ko");
  });
});
