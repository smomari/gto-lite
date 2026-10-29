import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement layout scrolling; components that call it would otherwise throw.
Element.prototype.scrollIntoView ??= function () {};
