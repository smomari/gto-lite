import { createHash } from "node:crypto";
import { PROMPT_VERSION, type ExplainLanguage } from "./prompt";
import type { HandSummary } from "./summarySchema";

export const USER_DAILY_LIMIT = 3;
export const GLOBAL_DAILY_LIMIT = 300;
/** Counters outlive their day long enough for a refund that lands after midnight. */
const COUNTER_TTL_SECONDS = 48 * 3600;
const CACHE_TTL_SECONDS = 30 * 24 * 3600;
const KST_OFFSET_MS = 9 * 3600 * 1000;

/** The subset of the Upstash Redis client this uses, so tests can pass an in-memory one. */
export interface ExplainStore {
  incr(key: string): Promise<number>;
  decr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, options: { ex: number }): Promise<unknown>;
}

/** Who is asking: a signed anonymous cookie id, and a hash of their IP. Either one reaching the limit blocks. */
export interface Requester {
  userId: string;
  ipHash: string;
}

/** Days roll over at midnight in Korea. */
export function kstDate(now: Date): string {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function counterKeys(requester: Requester, date: string): string[] {
  return [`explain:user:${requester.userId}:${date}`, `explain:ip:${requester.ipHash}:${date}`, `explain:global:${date}`];
}

export interface UsageStatus {
  remaining: number;
  /** The whole service has used up today's explanations. */
  globalExhausted: boolean;
}

function statusOf(user: number, ip: number, global: number): UsageStatus {
  return { remaining: Math.max(0, USER_DAILY_LIMIT - Math.max(user, ip)), globalExhausted: global >= GLOBAL_DAILY_LIMIT };
}

export async function usageStatus(store: ExplainStore, requester: Requester, now: Date): Promise<UsageStatus> {
  const [user, ip, global] = await Promise.all(counterKeys(requester, kstDate(now)).map((key) => store.get<number>(key)));
  return statusOf(Number(user ?? 0), Number(ip ?? 0), Number(global ?? 0));
}

/** The counters one explanation took, to give back if it fails. */
export interface Reservation {
  keys: string[];
  status: UsageStatus;
}

export type ReserveResult = { ok: true; reservation: Reservation } | { ok: false; reason: "user-limit" | "global-limit"; status: UsageStatus };

/**
 * Takes one explanation from the requester's and the service's counters for
 * today. Each counter is incremented atomically first and given back if that
 * went over its limit, so concurrent requests can't both slip under it.
 */
export async function reserveExplanation(store: ExplainStore, requester: Requester, now: Date): Promise<ReserveResult> {
  const keys = counterKeys(requester, kstDate(now));
  const [user, ip, global] = await Promise.all(keys.map((key) => store.incr(key)));
  await Promise.all(keys.map((key) => store.expire(key, COUNTER_TTL_SECONDS)));

  const overUser = Math.max(user, ip) > USER_DAILY_LIMIT;
  const overGlobal = global > GLOBAL_DAILY_LIMIT;
  if (overUser || overGlobal) {
    await Promise.all(keys.map((key) => store.decr(key)));
    return { ok: false, reason: overUser ? "user-limit" : "global-limit", status: statusOf(user - 1, ip - 1, global - 1) };
  }
  return { ok: true, reservation: { keys, status: statusOf(user, ip, global) } };
}

export async function refundExplanation(store: ExplainStore, reservation: Reservation): Promise<void> {
  await Promise.all(reservation.keys.map((key) => store.decr(key)));
}

/** One explanation per hand line, model, language and prompt version. */
export function explanationCacheKey(summary: HandSummary, language: ExplainLanguage, model: string): string {
  const hash = createHash("sha256").update(JSON.stringify({ version: PROMPT_VERSION, model, language, summary })).digest("hex");
  return `explain:cache:${hash}`;
}

export async function cachedExplanation(store: ExplainStore, key: string): Promise<string | null> {
  // Stored wrapped: the Upstash client parses JSON-looking strings on read.
  const entry = await store.get<{ text: string }>(key);
  return typeof entry?.text === "string" ? entry.text : null;
}

export async function cacheExplanation(store: ExplainStore, key: string, text: string): Promise<void> {
  await store.set(key, { text }, { ex: CACHE_TTL_SECONDS });
}
