import { afterEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { setLocale } from "@/lib/i18n/locale";
import { AboutPage } from "./AboutPage";

afterEach(() => {
  act(() => setLocale("en"));
});

describe("AboutPage", () => {
  it("explains the tool, with ways back to the solver and out to the issue tracker", () => {
    render(<AboutPage />);
    expect(screen.getByRole("heading", { level: 1, name: "About gtoLite" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "How accurate it is" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What it doesn't do" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the solver" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /gtoLite/ })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Open an issue on GitHub" })).toHaveAttribute("href", "https://github.com/smomari/gto-lite/issues");
  });

  it("gives the preflop section the anchor the source badge links to", () => {
    const { container } = render(<AboutPage />);
    expect(container.querySelector("#preflop")).toHaveTextContent("How preflop ranges are made");
  });

  it("switches to Korean with the header's language buttons", () => {
    render(<AboutPage />);
    fireEvent.click(screen.getByRole("button", { name: "한" }));
    expect(screen.getByRole("heading", { level: 1, name: "gtoLite 소개" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "솔버 열기" })).toBeInTheDocument();
  });
});
