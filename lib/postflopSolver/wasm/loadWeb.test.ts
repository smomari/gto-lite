import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./solver.web.mjs", () => ({ default: vi.fn() }));
vi.mock("./solver.web-threads.mjs", () => ({ default: vi.fn() }));

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

async function load(createModule: () => Promise<unknown>) {
  vi.resetModules();
  const { default: create } = await import("./solver.web.mjs");
  vi.mocked(create).mockImplementation(createModule as never);
  const { loadWebSolverModule } = await import("./loadWeb");
  return loadWebSolverModule();
}

describe("loadWebSolverModule", () => {
  it("uses the one-thread build on a page that can't share memory", async () => {
    const solver = {};
    await expect(load(async () => solver)).resolves.toEqual({ solver, threads: 1 });
  });

  it("falls back to one thread when the threaded build can't start", async () => {
    vi.stubGlobal("crossOriginIsolated", true);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.resetModules();
    const { default: createThreaded } = await import("./solver.web-threads.mjs");
    vi.mocked(createThreaded).mockRejectedValue(new RangeError("WebAssembly.Memory(): could not allocate memory"));
    const { default: create } = await import("./solver.web.mjs");
    const solver = {};
    vi.mocked(create).mockResolvedValue(solver as never);
    const { loadWebSolverModule } = await import("./loadWeb");

    await expect(loadWebSolverModule()).resolves.toEqual({ solver, threads: 1 });
    expect(warn).toHaveBeenCalled();
  });

  it("rejects with a message naming the browsers it needs when the module can't load", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(load(() => Promise.reject(new WebAssembly.CompileError("no SIMD")))).rejects.toThrow(/WebAssembly SIMD \(Chrome 91\+/);
  });
});
