import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import NotFound from "./not-found";

describe("NotFound", () => {
  it("says the page is missing and links back to the solver", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to the solver" })).toHaveAttribute("href", "/");
  });
});
