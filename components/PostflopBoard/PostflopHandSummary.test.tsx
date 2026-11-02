import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { PostflopHandSummary } from "./PostflopHandSummary";

const combo = (a: string, b: string, weight: number) => ({ cards: [a, b] as [string, string], weight });
const props = {
  board: ["Kh", "7s", "2d", "As", "3c"],
  potBb: 8,
  rakeBb: 0,
  equity: { heroEquityPercent: 40, villainEquityPercent: 60, heroEvBb: 0, villainEvBb: 0 },
  streets: [
    { label: "Flop", potBb: 5, actions: ["SB Check", "BB Check"] },
    { label: "River", potBb: 8, actions: [] },
  ],
  hero: { label: "SB", start: [combo("Ah", "Ad", 1), combo("Qh", "Qd", 1)], end: [combo("Ah", "Ad", 0.5), combo("Qh", "Qd", 0)] },
  villain: { label: "BB", start: [combo("Jh", "Jd", 1)], end: [combo("Jh", "Jd", 1)] },
};

const cell = (root: HTMLElement, hand: string) => within(root).getAllByTestId("showdown-cell").find((c) => c.getAttribute("data-hand") === hand)!;

describe("PostflopHandSummary", () => {
  it("shows the board, final pot, and each side's equity with its share of the pot", () => {
    render(<PostflopHandSummary outcome={{ kind: "showdown" }} {...props} />);
    expect(screen.getByText("Hand complete · Showdown")).toBeInTheDocument();
    expect(screen.getByText("8.0bb")).toBeInTheDocument();
    expect(screen.getByText("40.0%")).toBeInTheDocument();
    expect(screen.getByText("60.0%")).toBeInTheDocument();
    expect(screen.getByText("3.2bb")).toBeInTheDocument();
    expect(screen.getByText("4.8bb")).toBeInTheDocument();
    expect(screen.getByTestId("summary-board").querySelectorAll("[data-card]")).toHaveLength(5);
  });

  it("fills a hand by how much of it reached the end, and counts what's left", () => {
    render(<PostflopHandSummary outcome={{ kind: "showdown" }} {...props} />);
    const hero = screen.getByTestId("summary-range-hero");
    expect(cell(hero, "AA")).toHaveAttribute("title", "AA: 50.0% reaches here");
    expect(cell(hero, "QQ")).not.toHaveAttribute("title");
    expect(within(hero).getByText("0.5 combos")).toBeInTheDocument();
  });

  it("lists each street's actions and marks one with none", () => {
    render(<PostflopHandSummary outcome={{ kind: "showdown" }} {...props} />);
    expect(screen.getByText("SB Check · BB Check")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("names the winner of a fold and leaves out equity", () => {
    render(<PostflopHandSummary outcome={{ kind: "fold", winnerLabel: "BB" }} {...props} equity={undefined} />);
    expect(screen.getByText("Hand complete · BB wins")).toBeInTheDocument();
    expect(screen.queryByText(/pot share/)).not.toBeInTheDocument();
  });

  it("explains an all-in runout", () => {
    render(<PostflopHandSummary outcome={{ kind: "allin", note: "Runs out automatically." }} {...props} />);
    expect(screen.getByText("All-in · Runout")).toBeInTheDocument();
    expect(screen.getByText("Runs out automatically.")).toBeInTheDocument();
  });

  it("says so when one side almost never reaches this line", () => {
    const hero = { ...props.hero, end: [combo("Ah", "Ad", 0.001)] };
    render(<PostflopHandSummary outcome={{ kind: "showdown" }} {...props} hero={hero} />);
    expect(screen.getByText("<0.1 combos")).toBeInTheDocument();
    expect(screen.getByText(/SB almost never takes this line/)).toBeInTheDocument();
    expect(screen.queryByText(/Average equity/)).not.toBeInTheDocument();
  });

  it("shows what to do next after the street list", () => {
    render(<PostflopHandSummary outcome={{ kind: "showdown" }} {...props} actions={<button>New hand</button>} />);
    expect(screen.getByRole("button", { name: "New hand" })).toBeInTheDocument();
  });

  it("switches between the two ranges on small screens", () => {
    render(<PostflopHandSummary outcome={{ kind: "showdown" }} {...props} />);
    expect(screen.getByTestId("summary-range-villain").className).toContain("hidden");
    fireEvent.click(screen.getByRole("tab", { name: "BB range" }));
    expect(screen.getByTestId("summary-range-villain").className).not.toContain("hidden");
    expect(screen.getByTestId("summary-range-hero").className).toContain("hidden");
  });

  it("shows the rake and splits only what the winner collects", () => {
    render(<PostflopHandSummary {...props} rakeBb={0.4} outcome={{ kind: "showdown" }} />);
    expect(screen.getByText("Rake").parentElement).toHaveTextContent("Rake 0.4bb");
    expect(screen.getByText("3.0bb")).toBeInTheDocument(); // 40% of 7.6
    expect(screen.getByText("4.6bb")).toBeInTheDocument(); // 60% of 7.6
  });

  it("says nothing about rake when there is none", () => {
    render(<PostflopHandSummary {...props} outcome={{ kind: "showdown" }} />);
    expect(screen.queryByText("Rake")).not.toBeInTheDocument();
  });
});
