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
    expect(explainInstructions("ko", ["Flop", "Turn", "River"])).toContain('"## 프리플랍", "## 플랍", "## 턴", "## 리버", "## 결과"');
    expect(explainInstructions("ko", ["Flop"])).toContain("Write in Korean");
    expect(explainInstructions("en", ["Flop", "Turn", "River"])).toContain('"## Preflop", "## Flop", "## Turn", "## River", "## Result"');
  });

  it("asks only for the streets the hand reached", () => {
    const flopOnly = explainInstructions("en", ["Flop"]);
    expect(flopOnly).toContain('"## Preflop", "## Flop", "## Result"');
    expect(flopOnly).not.toContain("## Turn");
    expect(flopOnly).not.toContain("## River");
    expect(explainInstructions("ko", ["Flop", "Turn"])).toContain('"## 프리플랍", "## 플랍", "## 턴", "## 결과"');
  });
});
