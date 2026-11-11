import { describe, expect, it } from "vitest";
import { explainInstructions, explainLanguage } from "./prompt";

describe("explainLanguage", () => {
  it("answers in Korean only when the page asks for it", () => {
    expect(explainLanguage("ko")).toBe("ko");
    expect(explainLanguage("en")).toBe("en");
    expect(explainLanguage("ja")).toBe("en");
    expect(explainLanguage(null)).toBe("en");
  });
});

describe("explainInstructions", () => {
  it("asks for sections in the reader's language", () => {
    expect(explainInstructions("ko")).toContain('"## 프리플랍", "## 플랍", "## 턴", "## 리버", then "## 결과"');
    expect(explainInstructions("ko")).toContain("Write in Korean");
    expect(explainInstructions("en")).toContain('"## Preflop", "## Flop"');
  });
});
