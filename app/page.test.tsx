import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { ALL_HANDS } from "@/lib/handRange/handList";
import { SolveApiError, solveNode } from "@/lib/apiClient/solveClient";
import { setLocale } from "@/lib/i18n/locale";
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
  // The page keeps its spot in the address, which outlives a test's render.
  window.history.replaceState(null, "", "/");
  vi.mocked(solveNode).mockImplementation(async ({ actionPath }) => {
    if (actionPath.length === 0) return firstDecision as never;
    throw new SolveApiError({ code: "HAND_RESOLVED", error: "resolved", reason: "uncontested", actionPath: [], potBb: 1.5, committed: {} } as never);
  });
});

afterEach(() => {
  act(() => setLocale("en"));
});

function openSettings() {
  fireEvent.click(screen.getByRole("button", { name: /Settings/ }));
}

function applyStack(stackBb: number) {
  openSettings();
  fireEvent.change(screen.getByRole("spinbutton"), { target: { value: String(stackBb) } });
  fireEvent.click(screen.getByRole("button", { name: "Apply" }));
}

const activeSeat = () => screen.getAllByTestId("seat-box").find((b) => b.getAttribute("data-kind") === "active")!;

describe("Home", () => {
  it("New hand on a hand that ended preflop goes back to the first decision, keeping the stack", async () => {
    render(<Home />);
    applyStack(40);
    await screen.findAllByRole("button", { name: "Fold" });
    fireEvent.click(within(activeSeat()).getByRole("button", { name: "Fold" }));

    fireEvent.click(await screen.findByRole("button", { name: "New hand" }));

    await screen.findAllByRole("button", { name: "Fold" });
    expect(activeSeat()).toHaveAttribute("data-position", "UTG");
    expect(screen.queryByRole("button", { name: "New hand" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Settings/ })).toHaveTextContent("40bb");
  });

  it("a new ICM stage restarts the hand and asks for that stage", async () => {
    render(<Home />);
    await screen.findAllByRole("button", { name: "Fold" });
    expect(solveNode).toHaveBeenLastCalledWith(expect.objectContaining({ icm: "chip-ev" }), expect.anything());
    fireEvent.click(within(activeSeat()).getByRole("button", { name: "Fold" }));
    await screen.findByRole("button", { name: "New hand" });

    openSettings();
    fireEvent.click(screen.getByRole("radio", { name: /^Bubble/ }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await screen.findAllByRole("button", { name: "Fold" });
    expect(screen.queryByRole("button", { name: "New hand" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Settings/ })).toHaveTextContent("ICM Bubble");
    expect(solveNode).toHaveBeenLastCalledWith(expect.objectContaining({ actionPath: [], format: "tournament-8", icm: "bubble" }), expect.anything());
  });

  it("shows the seat to act while its range loads", async () => {
    let finish: (value: unknown) => void = () => {};
    vi.mocked(solveNode).mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)) as never);
    render(<Home />);
    expect(activeSeat()).toHaveAttribute("data-position", "UTG");
    expect(within(activeSeat()).getByText("...")).toBeInTheDocument();
    await act(async () => finish(firstDecision));
    expect(within(activeSeat()).getByRole("button", { name: "Fold" })).toBeInTheDocument();
  });

  it("fetches a range the quick action skipped, and can retry it", async () => {
    const folds = ["UTG", "UTG1", "LJ", "HJ", "CO"].map((actor) => ({ actor, action: "fold" }));
    const toBtn = [...folds, { actor: "BTN", action: "raise" }];
    const closed = [...toBtn, { actor: "SB", action: "fold" }, { actor: "BB", action: "call" }];
    const failing = { current: true };
    vi.mocked(solveNode).mockImplementation(async ({ actionPath }) => {
      if (actionPath.length === 0) return firstDecision as never;
      if (actionPath.at(-1)?.action === "raise") {
        throw new SolveApiError({ code: "HAND_RESOLVED", error: "resolved", reason: "action-closed", actionPath: closed, potBb: 6.5, committed: { BTN: 2.5, BB: 2.5 } } as never);
      }
      if (failing.current) throw new Error("Network down");
      const heroPosition = actionPath.length === 5 ? "BTN" : "BB";
      return { ...firstDecision, heroPosition, actionPath } as never;
    });
    render(<Home />);
    await screen.findAllByRole("button", { name: "Fold" });
    const btn = screen.getAllByTestId("seat-box").find((b) => b.getAttribute("data-position") === "BTN")!;
    fireEvent.click(within(btn).getByRole("button", { name: /^Raise/ }));

    const retry = await screen.findByRole("button", { name: "Retry" });
    failing.current = false;
    fireEvent.click(retry);
    expect(await screen.findByText(/Pick the 3 flop cards/)).toBeInTheDocument();
  });

  it("keeps the hand on screen when a request fails, with a way to retry or start over", async () => {
    render(<Home />);
    await screen.findAllByRole("button", { name: "Fold" });
    vi.mocked(solveNode).mockRejectedValueOnce(new Error("Network down"));
    fireEvent.click(within(activeSeat()).getByRole("button", { name: "Raise 2.5bb" }));

    expect(await screen.findByText(/Network down/)).toBeInTheDocument();
    expect(screen.getAllByTestId("seat-box").some((b) => b.getAttribute("data-position") === "UTG")).toBe(true);

    vi.mocked(solveNode).mockResolvedValueOnce({ ...firstDecision, heroPosition: "UTG1", actionPath: [] } as never);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("button", { name: "Raise 2.5bb" })).toBeInTheDocument();
    expect(screen.queryByText(/Network down/)).not.toBeInTheDocument();
  });

  it("starts over from a failed first request", async () => {
    vi.mocked(solveNode).mockRejectedValueOnce(new Error("Network down"));
    render(<Home />);
    expect(await screen.findByText(/Network down/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "New hand" }));
    await screen.findAllByRole("button", { name: "Fold" });
    expect(screen.queryByText(/Network down/)).not.toBeInTheDocument();
  });

  it("a new format restarts the hand and asks for that format; Cancel leaves it alone", async () => {
    render(<Home />);
    await screen.findAllByRole("button", { name: "Fold" });
    fireEvent.click(within(activeSeat()).getByRole("button", { name: "Fold" }));
    await screen.findByRole("button", { name: "New hand" });

    openSettings();
    fireEvent.click(screen.getByRole("radio", { name: "Cash 6-max" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "New hand" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Settings/ })).toHaveTextContent("Tournament 8-max");

    openSettings();
    fireEvent.click(screen.getByRole("radio", { name: "Cash 6-max" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await screen.findAllByRole("button", { name: "Fold" });
    expect(screen.queryByRole("button", { name: "New hand" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Settings/ })).toHaveTextContent("Cash 6-max");
    expect(solveNode).toHaveBeenLastCalledWith(expect.objectContaining({ actionPath: [], format: "cash-6" }), expect.anything());
  });

  it("a new rake restarts the hand and asks for that rake", async () => {
    render(<Home />);
    await screen.findAllByRole("button", { name: "Fold" });
    openSettings();
    fireEvent.click(screen.getByRole("radio", { name: "Cash 8-max" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await screen.findAllByRole("button", { name: "Fold" });
    expect(screen.getByRole("button", { name: /Settings/ })).toHaveTextContent("5%/5bb");
    fireEvent.click(within(activeSeat()).getByRole("button", { name: "Fold" }));
    await screen.findByRole("button", { name: "New hand" });

    openSettings();
    fireEvent.click(screen.getByRole("radio", { name: /Live/ }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await screen.findAllByRole("button", { name: "Fold" });
    expect(screen.queryByRole("button", { name: "New hand" })).not.toBeInTheDocument();
    expect(solveNode).toHaveBeenLastCalledWith(expect.objectContaining({ actionPath: [], format: "cash-8", rake: "live", noFlopNoDrop: true }), expect.anything());
  });

  it("the name in the header starts over from the first decision, keeping the stack", async () => {
    render(<Home />);
    applyStack(40);
    await screen.findAllByRole("button", { name: "Fold" });
    fireEvent.click(within(activeSeat()).getByRole("button", { name: "Fold" }));
    await screen.findByRole("button", { name: "New hand" });

    fireEvent.click(screen.getByRole("button", { name: /Start over/ }));

    await screen.findAllByRole("button", { name: "Fold" });
    expect(activeSeat()).toHaveAttribute("data-position", "UTG");
    expect(screen.queryByRole("button", { name: "New hand" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Settings/ })).toHaveTextContent("40bb");
    expect(window.location.search).toBe("?s=40");
  });

  it("the name in the header closes Settings without applying it", async () => {
    render(<Home />);
    await screen.findAllByRole("button", { name: "Fold" });
    openSettings();
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "40" } });

    fireEvent.click(screen.getByRole("button", { name: /Start over/ }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Settings/ })).toHaveTextContent("100bb");
  });

  it("Apply without a change keeps the hand; a new stack restarts it", async () => {
    render(<Home />);
    await screen.findAllByRole("button", { name: "Fold" });
    fireEvent.click(within(activeSeat()).getByRole("button", { name: "Fold" }));
    await screen.findByRole("button", { name: "New hand" });

    openSettings();
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New hand" })).toBeInTheDocument();

    applyStack(40);
    await screen.findAllByRole("button", { name: "Fold" });
    expect(screen.queryByRole("button", { name: "New hand" })).not.toBeInTheDocument();
    expect(activeSeat()).toHaveAttribute("data-position", "UTG");
  });

  it("switches the page to Korean without restarting the hand", async () => {
    render(<Home />);
    await screen.findAllByRole("button", { name: "Fold" });
    const requests = vi.mocked(solveNode).mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "한" }));
    expect(within(activeSeat()).getByRole("button", { name: "폴드" })).toBeInTheDocument();
    expect(within(activeSeat()).getByRole("button", { name: "레이즈 2.5bb" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /설정/ })).toHaveTextContent("토너먼트 8인");
    expect(vi.mocked(solveNode).mock.calls.length).toBe(requests);
    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(within(activeSeat()).getByRole("button", { name: "Fold" })).toBeInTheDocument();
  });
});

describe("Home's address and what the browser remembers", () => {
  // Node's own localStorage shadows jsdom's and is unusable without a file, so each test gets a plain one.
  let stored: Map<string, string>;
  beforeEach(() => {
    stored = new Map();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value) },
    });
  });

  const settingsButton = () => screen.getByRole("button", { name: /Settings/ });

  it("starts at the spot in the address", async () => {
    window.history.replaceState(null, "", "/?s=40&p=ff");
    vi.mocked(solveNode).mockImplementation(async ({ actionPath }) => ({ ...firstDecision, heroPosition: "LJ", actionPath }) as never);
    render(<Home />);
    await screen.findAllByRole("button", { name: "Fold" });
    expect(solveNode).toHaveBeenLastCalledWith(
      expect.objectContaining({
        effectiveStackBb: 40,
        actionPath: [
          { actor: "UTG", action: "fold" },
          { actor: "UTG1", action: "fold" },
        ],
      }),
      expect.anything(),
    );
    expect(activeSeat()).toHaveAttribute("data-position", "LJ");
    expect(settingsButton()).toHaveTextContent("40bb");
  });

  it("writes each action and setting into the address, keeping what else it carries", async () => {
    window.history.replaceState(null, "", "/?utm_source=reddit");
    render(<Home />);
    await screen.findAllByRole("button", { name: "Fold" });
    expect(window.location.search).toBe("?utm_source=reddit");

    fireEvent.click(within(activeSeat()).getByRole("button", { name: "Fold" }));
    await screen.findByRole("button", { name: "New hand" });
    expect(window.location.search).toBe("?utm_source=reddit&p=f");

    applyStack(40);
    await screen.findAllByRole("button", { name: "Fold" });
    expect(window.location.search).toBe("?utm_source=reddit&s=40");
  });

  it("leaves the address plain for the default table with no action", async () => {
    window.history.replaceState(null, "", "/?s=40");
    render(<Home />);
    await screen.findAllByRole("button", { name: "Fold" });
    applyStack(100);
    await screen.findAllByRole("button", { name: "Fold" });
    expect(`${window.location.pathname}${window.location.search}`).toBe("/");
  });

  it("remembers the table applied in Settings and starts the next visit there", async () => {
    const first = render(<Home />);
    await screen.findAllByRole("button", { name: "Fold" });
    applyStack(40);
    await screen.findAllByRole("button", { name: "Fold" });
    expect(JSON.parse(stored.get("gtoLite.settings")!)).toMatchObject({ stackBb: 40, format: "tournament-8" });

    first.unmount();
    window.history.replaceState(null, "", "/");
    render(<Home />);
    await screen.findAllByRole("button", { name: "Fold" });
    expect(settingsButton()).toHaveTextContent("40bb");
    expect(solveNode).toHaveBeenLastCalledWith(expect.objectContaining({ effectiveStackBb: 40 }), expect.anything());
  });

  it("lets a link's table win over the remembered one, without replacing it", async () => {
    const remembered = JSON.stringify({ stackBb: 40, format: "cash-6", rake: "live", noFlopNoDrop: true, icm: "chip-ev" });
    stored.set("gtoLite.settings", remembered);
    window.history.replaceState(null, "", "/?s=25");
    render(<Home />);
    await screen.findAllByRole("button", { name: "Fold" });
    expect(settingsButton()).toHaveTextContent("Tournament 8-max");
    expect(settingsButton()).toHaveTextContent("25bb");
    expect(stored.get("gtoLite.settings")).toBe(remembered);
  });

  it("shows the how-to line until it is dismissed, and not on the next visit", async () => {
    const first = render(<Home />);
    await screen.findAllByRole("button", { name: "Fold" });
    expect(screen.getByText(/Pick an action under a seat/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText(/Pick an action under a seat/)).not.toBeInTheDocument();

    first.unmount();
    render(<Home />);
    await screen.findAllByRole("button", { name: "Fold" });
    expect(screen.queryByText(/Pick an action under a seat/)).not.toBeInTheDocument();
  });

  it("copies the spot's address from the Share button", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    window.history.replaceState(null, "", "/?s=40");
    render(<Home />);
    await screen.findAllByRole("button", { name: "Fold" });
    fireEvent.click(screen.getByRole("button", { name: "Copy a link to this spot" }));
    expect(await screen.findByText("Link copied")).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\?s=40$/));
  });

  it("links to the About page from the header and from the source badge", async () => {
    render(<Home />);
    await screen.findAllByRole("button", { name: "Fold" });
    expect(screen.getByRole("link", { name: "About" })).toHaveAttribute("href", "/about");
    expect(screen.getByRole("link", { name: "Estimated" })).toHaveAttribute("href", "/about#preflop");
  });
});

