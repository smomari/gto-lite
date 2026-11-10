import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const EXPLAIN_ID_COOKIE = "gtolite_explain_id";
export const EXPLAIN_ID_MAX_AGE_SECONDS = 365 * 24 * 3600;

function signature(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

/** A new anonymous id and the signed cookie value that carries it. */
export function newExplainId(secret: string): { id: string; cookie: string } {
  const id = randomUUID();
  return { id, cookie: `${id}.${signature(id, secret)}` };
}

/** The id in a cookie this server signed, or null for a missing or forged one. */
export function verifyExplainId(cookie: string | undefined, secret: string): string | null {
  if (!cookie) return null;
  const dot = cookie.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = cookie.slice(0, dot);
  const given = Buffer.from(cookie.slice(dot + 1));
  const expected = Buffer.from(signature(id, secret));
  return given.length === expected.length && timingSafeEqual(given, expected) ? id : null;
}

/** The caller's IP, as Vercel's proxy reports it, hashed so the address itself is never stored. */
export function hashedClientIp(headers: Headers, secret: string): string {
  const ip = headers.get("x-forwarded-for")?.split(",")[0].trim() || headers.get("x-real-ip") || "unknown";
  return createHmac("sha256", secret).update(`ip:${ip}`).digest("hex").slice(0, 32);
}
