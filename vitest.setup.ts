import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement layout scrolling; components that call it would otherwise throw.
// (Absent entirely in `@vitest-environment node` files, e.g. the WASM tests.)
if (typeof Element !== "undefined") Element.prototype.scrollIntoView ??= function () {};
// jsdom has <dialog> but not its modal API.
if (typeof HTMLDialogElement !== "undefined") {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
}
