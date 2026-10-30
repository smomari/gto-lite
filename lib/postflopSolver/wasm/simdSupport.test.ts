// @vitest-environment node
import { describe, expect, it } from "vitest";
import { supportsWasmSimd } from "./simdSupport";

describe("supportsWasmSimd", () => {
  it("is true on an engine with WebAssembly SIMD (Node's V8)", () => {
    expect(supportsWasmSimd()).toBe(true);
  });
});
