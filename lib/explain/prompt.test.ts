import { describe, expect, it } from "vitest";
import { explainInstructions, explainLanguage } from "./prompt";

describe("explainLanguage", () => {
  it("answers in Korean only when the browser ranks Korean first", () => {
    expect(explainLanguage("ko-KR,ko;q=0.9,en-US;q=0.8")).toBe("ko");
    expect(explainLanguage("en-US,en;q=0.9,ko;q=0.8")).toBe("en");
    expect(explainLanguage("en;q=0.5,ko;q=0.7")).toBe("ko");
    expect(explainLanguage("ja-JP")).toBe("en");
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
