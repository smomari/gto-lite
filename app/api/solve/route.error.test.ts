import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/equity/loadEquityMatrix", () => ({
  loadEquityMatrix: () => {
    throw new Error("ENOENT: /var/task/data/equity/matrix.json");
  },
}));

import { POST } from "./route";

describe("POST /api/solve when the engine throws", () => {
  afterEach(() => vi.restoreAllMocks());

  it("answers 500 without the engine's own message, and logs it", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(
      new Request("http://localhost/api/solve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ effectiveStackBb: 100, actionPath: [] }),
      }),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "The solve failed on the server", code: "INTERNAL" });
    expect(JSON.stringify(body)).not.toContain("ENOENT");
    expect(logged).toHaveBeenCalled();
  });
});
