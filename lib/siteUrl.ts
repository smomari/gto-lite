/**
 * The site's public origin, for absolute links in metadata, the sitemap and
 * robots.txt: the custom domain once NEXT_PUBLIC_SITE_URL is set, else the
 * project's Vercel production address, else the local dev server.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return vercel ? `https://${vercel}` : "http://localhost:3000";
}

export const SITE_NAME = "gtoLite";
export const SITE_TAGLINE = "Poker ranges and a postflop solver in your browser";
export const SITE_DESCRIPTION =
  "Free poker study tool: tournament and cash preflop ranges with ICM, and a postflop GTO solver that runs in your browser.";
export const REPO_URL = "https://github.com/smomari/gto-lite";
export const FEEDBACK_URL = `${REPO_URL}/issues`;
