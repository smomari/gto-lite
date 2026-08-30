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
  });

  it("rejects an out-of-range effective stack", async () => {
    const res = await POST(makeRequest({ effectiveStackBb: 150, actionPath: [] }));
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
    expect(utgNode.sizeBb).toBe(4);
    const bbNode = body.actionPath.find((n: { actor: string }) => n.actor === "BB");
    expect(bbNode.label).toBe("3bet");
    expect(bbNode.sizeBb).toBe(12);
  });
});
