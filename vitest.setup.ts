import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement layout scrolling; components that call it would otherwise throw.
// (Absent entirely in `@vitest-environment node` files, e.g. the WASM tests.)
if (typeof Element !== "undefined") Element.prototype.scrollIntoView ??= function () {};
