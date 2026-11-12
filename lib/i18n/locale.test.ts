import { describe, expect, it } from "vitest";
import { pickLocale } from "./locale";

describe("pickLocale", () => {
  it("keeps a remembered choice whatever the browser's language", () => {
    expect(pickLocale("en", "ko-KR")).toBe("en");
    expect(pickLocale("ko", "en-US")).toBe("ko");
  });

  it("starts a first visit in Korean for a Korean browser, and in English for any other", () => {
    expect(pickLocale(null, "ko-KR")).toBe("ko");
    expect(pickLocale(null, "ko")).toBe("ko");
    expect(pickLocale(null, "en-US")).toBe("en");
    expect(pickLocale(null, "ja-JP")).toBe("en");
    expect(pickLocale(null, undefined)).toBe("en");
  });

  it("ignores a stored value it doesn't know", () => {
    expect(pickLocale("fr", "ko-KR")).toBe("ko");
  });
});
