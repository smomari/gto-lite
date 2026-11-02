import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ALL_HANDS } from "@/lib/handRange/handList";
import { SolveApiError, solveNode } from "@/lib/apiClient/solveClient";
import Home from "./page";

vi.mock("@/lib/apiClient/solveClient", async (original) => ({
  ...(await original<typeof import("@/lib/apiClient/solveClient")>()),
  solveNode: vi.fn(),
}));

const firstDecision = {
  heroPosition: "UTG",
  stackDepth: 100,
  nodeId: "rfi",
  actionPath: [],
  source: "heuristic-approx",
  generatedAt: new Date(0).toISOString(),
  version: "test",
  hands: ALL_HANDS.map((h) => ({ hand: h.hand, fold: 1, call: 0, raise: 0 })),
  potBb: 1.5,
  currentBetToCall: 1,
  availableActions: { fold: true, call: null, raise: { toBb: 2.5 }, allin: { toBb: 100 } },
};

beforeEach(() => {
  vi.mocked(solveNode).mockImplementation(async ({ actionPath }) => {
    if (actionPath.length === 0) return firstDecision as never;
    throw new SolveApiError({ code: "HAND_RESOLVED", error: "resolved", reason: "uncontested", actionPath: [], potBb: 1.5, committed: {} } as never);
  });
});

describe("Home", () => {
  it("New hand on a hand that ended preflop goes back to the first decision, keeping the stack", async () => {
    render(<Home />);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "40" } });
    await screen.findAllByRole("button", { name: "Fold" });
    const activeSeat = () => screen.getAllByTestId("seat-box").find((b) => b.getAttribute("data-kind") === "active")!;
    fireEvent.click(within(activeSeat()).getByRole("button", { name: "Fold" }));

    fireEvent.click(await screen.findByRole("button", { name: "New hand" }));

    await screen.findAllByRole("button", { name: "Fold" });
    expect(activeSeat()).toHaveAttribute("data-position", "UTG");
    expect(screen.queryByRole("button", { name: "New hand" })).not.toBeInTheDocument();
    expect(screen.getByRole("spinbutton")).toHaveValue(40);
  });
});
