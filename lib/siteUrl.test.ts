import { afterEach, describe, expect, it, vi } from "vitest";
import { siteUrl } from "./siteUrl";

describe("siteUrl", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("prefers the configured domain, without a trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com/");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "project.vercel.app");
    expect(siteUrl()).toBe("https://example.com");
  });

  it("falls back to the Vercel production address, then to the dev server", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "project.vercel.app");
    expect(siteUrl()).toBe("https://project.vercel.app");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    expect(siteUrl()).toBe("http://localhost:3000");
  });
});
