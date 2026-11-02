import { afterEach, describe, expect, it, vi } from "vitest";
import { SolveApiError, solveNode } from "./solveClient";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("solveNode", () => {
  it("passes the server's error along", async () => {
    const body = { error: "Bad stack", code: "INVALID_STACK" };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 400 })));
    await expect(solveNode({ effectiveStackBb: 1, actionPath: [] })).rejects.toMatchObject({ code: "INVALID_STACK", message: "Bad stack" });
  });

  it("turns an error page into a readable error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>Bad Gateway</html>", { status: 502 })));
    const error = await solveNode({ effectiveStackBb: 100, actionPath: [] }).catch((err) => err);
    expect(error).toBeInstanceOf(SolveApiError);
    expect(error.message).toBe("Request failed (502)");
  });
});
