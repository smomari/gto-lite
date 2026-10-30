/**
 * Smallest module using a WebAssembly SIMD instruction (`i8x16.popcnt` on a
 * splat), as used by wasm-feature-detect: it validates exactly when the engine
 * supports the SIMD the solver core (native/build-wasm.sh, `-msimd128`) needs.
 */
const SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
]);

/** Whether this engine can run the C++/WASM solver core — synchronous, so callers can decide before starting workers. */
export function supportsWasmSimd(): boolean {
  return typeof WebAssembly === "object" && WebAssembly.validate(SIMD_PROBE);
}
