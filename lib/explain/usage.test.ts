import { describe, expect, it } from "vitest";
import { memoryStore } from "./explainTestUtils";
import { GLOBAL_DAILY_LIMIT, USER_DAILY_LIMIT, kstDate, refundExplanation, reserveExplanation, usageStatus } from "./usage";

const NOW = new Date("2026-11-10T03:00:00Z");
const alice = { userId: "alice", ipHash: "ip-a" };

describe("kstDate", () => {
  it("rolls over at midnight in Korea, 15:00 UTC", () => {
    expect(kstDate(new Date("2026-11-10T14:59:59Z"))).toBe("2026-11-10");
    expect(kstDate(new Date("2026-11-10T15:00:00Z"))).toBe("2026-11-11");
  });
});

describe("reserveExplanation", () => {
  it("allows the daily limit per user, then refuses without counting the refused one", async () => {
    const store = memoryStore();
    for (let i = 0; i < USER_DAILY_LIMIT; i++) expect((await reserveExplanation(store, alice, NOW)).ok).toBe(true);
    expect(await reserveExplanation(store, alice, NOW)).toMatchObject({ ok: false, reason: "user-limit", status: { remaining: 0 } });
    expect(store.values.get("explain:global:2026-11-10")).toBe(USER_DAILY_LIMIT);
    expect(store.ttls.get("explain:user:alice:2026-11-10")).toBe(48 * 3600);
  });

  it("blocks a new cookie from the same IP", async () => {
    const store = memoryStore();
    for (let i = 0; i < USER_DAILY_LIMIT; i++) await reserveExplanation(store, alice, NOW);
    expect(await reserveExplanation(store, { userId: "alice-again", ipHash: "ip-a" }, NOW)).toMatchObject({ ok: false, reason: "user-limit" });
    expect((await reserveExplanation(store, { userId: "bob", ipHash: "ip-b" }, NOW)).ok).toBe(true);
  });

  it("stops everyone once the service's daily limit is used", async () => {
    const store = memoryStore();
    store.values.set("explain:global:2026-11-10", GLOBAL_DAILY_LIMIT);
    expect(await reserveExplanation(store, alice, NOW)).toMatchObject({ ok: false, reason: "global-limit", status: { remaining: USER_DAILY_LIMIT, globalExhausted: true } });
    expect(await usageStatus(store, alice, NOW)).toEqual({ remaining: USER_DAILY_LIMIT, globalExhausted: true });
  });

  it("gives a failed explanation back, to the day it was taken from", async () => {
    const store = memoryStore();
    const reserved = await reserveExplanation(store, alice, NOW);
    if (!reserved.ok) throw new Error("expected a reservation");
    expect(reserved.reservation.status.remaining).toBe(USER_DAILY_LIMIT - 1);
    await refundExplanation(store, reserved.reservation);
    expect(await usageStatus(store, alice, NOW)).toEqual({ remaining: USER_DAILY_LIMIT, globalExhausted: false });
  });
});
