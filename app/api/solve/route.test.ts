import { describe, expect, it } from "vitest";
import { POST } from "./route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/solve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/solve", () => {
  it("returns a well-formed SolveResponse for a valid opening request", async () => {
    const res = await POST(makeRequest({ effectiveStackBb: 100, actionPath: [] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.heroPosition).toBe("UTG");
    expect(body.stackDepth).toBe(100);
    expect(body.hands).toHaveLength(169);
    expect(body.availableActions.fold).toBe(true);
    expect(body.availableActions.call).toBeNull();
    expect(body.potBb).toBe(2.5);
    expect(body.source).toBe("heuristic-approx");
  });

  it("starts a cash 6-max hand at LJ with no ante", async () => {
    const res = await POST(makeRequest({ effectiveStackBb: 100, actionPath: [], format: "cash-6" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.heroPosition).toBe("LJ");
    expect(body.potBb).toBe(1.5);
    expect(body.availableActions.raise).toEqual({ toBb: 2.5 });
  });

  it("rejects an unknown format", async () => {
    const res = await POST(makeRequest({ effectiveStackBb: 100, actionPath: [], format: "cash-9" }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_FORMAT");
  });

  it("rejects an unknown rake or a malformed drop rule", async () => {
    for (const body of [{ rake: "rake-free" }, { noFlopNoDrop: "yes" }]) {
      const res = await POST(makeRequest({ effectiveStackBb: 100, actionPath: [], format: "cash-6", ...body }));
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("INVALID_RAKE");
    }
  });

  it("offers SB a limp when folded to it", async () => {
    const actionPath = ["UTG", "UTG1", "LJ", "HJ", "CO", "BTN"].map((actor) => ({ actor, action: "fold" }));
    const res = await POST(makeRequest({ effectiveStackBb: 100, actionPath }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.heroPosition).toBe("SB");
    expect(body.source).toBe("heuristic-approx");
    expect(body.availableActions.call).toEqual({ label: "Limp", amountBb: 0.5 });
  });

  it("closes the hand when BB checks behind a limp", async () => {
    const actionPath = [
      ...["UTG", "UTG1", "LJ", "HJ", "CO", "BTN"].map((actor) => ({ actor, action: "fold" })),
      { actor: "SB", action: "call" },
      { actor: "BB", action: "call" },
    ];
    const res = await POST(makeRequest({ effectiveStackBb: 40, actionPath }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("HAND_RESOLVED");
    expect(body.reason).toBe("action-closed");
    expect(body.actionPath.slice(-2).map((n: { label: string }) => n.label)).toEqual(["limp", "check"]);
    expect(body.potBb).toBe(3);
  });

  it("rejects an out-of-range effective stack", async () => {
    const res = await POST(makeRequest({ effectiveStackBb: 150, actionPath: [] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_STACK");
  });

  it("rejects a 1bb stack, where an all-in can't raise and the action never closes", async () => {
    const res = await POST(makeRequest({ effectiveStackBb: 1, actionPath: [] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_STACK");
  });

  it("rejects a malformed action path", async () => {
    const res = await POST(
      makeRequest({ effectiveStackBb: 100, actionPath: [{ actor: "NOTASEAT", action: "fold" }] }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_ACTION_PATH");
  });

  it("returns HAND_RESOLVED with reason uncontested when everyone folds to BB", async () => {
    const actionPath = ["UTG", "UTG1", "LJ", "HJ", "CO", "BTN", "SB"].map((actor) => ({
      actor,
      action: "fold",
    }));
    const res = await POST(makeRequest({ effectiveStackBb: 100, actionPath }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("HAND_RESOLVED");
    expect(body.reason).toBe("uncontested");
    expect(body.actionPath).toHaveLength(7);
    expect(body.actionPath.every((n: { action: string }) => n.action === "fold")).toBe(true);
    expect(body.potBb).toBe(2.5);
  });

  it("ignores client-supplied label/sizeBb and returns server-canonical values, including on a reopened seat", async () => {
    const actionPath = [
      { actor: "UTG", action: "raise", label: "bogus", sizeBb: 999 },
      { actor: "UTG1", action: "fold" },
      { actor: "LJ", action: "fold" },
      { actor: "HJ", action: "fold" },
      { actor: "CO", action: "fold" },
      { actor: "BTN", action: "fold" },
      { actor: "SB", action: "fold" },
      { actor: "BB", action: "raise", label: "bogus", sizeBb: 1 },
    ];
    const res = await POST(makeRequest({ effectiveStackBb: 100, actionPath }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.heroPosition).toBe("UTG"); // reopened, facing BB's 3-bet
    const utgNode = body.actionPath.find((n: { actor: string }) => n.actor === "UTG");
    expect(utgNode.label).toBe("open");
    expect(utgNode.sizeBb).toBe(2.1); // UTG's open at 100bb
    const bbNode = body.actionPath.find((n: { actor: string }) => n.actor === "BB");
    expect(bbNode.label).toBe("3bet");
    expect(bbNode.sizeBb).toBe(11); // 2.1 * 5.25 (BB is OOP reacting to UTG)
    expect(body.source).toBe("heuristic-approx");
  });
});
