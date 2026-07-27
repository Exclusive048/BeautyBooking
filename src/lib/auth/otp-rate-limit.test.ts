import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SECURITY-EXPOSURE-AUDIT-01 · O2 — the OTP verify lockout must be scoped by
 * (identity + client IP), not by identity alone. Pins the property that a third
 * party hammering a victim's phone from their own IP cannot lock the victim out
 * from a different IP, while single-source brute-force stays bounded.
 *
 * Uses an in-memory Redis fake so no infra is required.
 */

type Entry = { value: string; expireAt: number | null };

function makeFakeRedis() {
  const store = new Map<string, Entry>();
  const now = () => Date.now();
  const live = (k: string): Entry | undefined => {
    const e = store.get(k);
    if (!e) return undefined;
    if (e.expireAt !== null && e.expireAt <= now()) {
      store.delete(k);
      return undefined;
    }
    return e;
  };
  return {
    store,
    async incr(k: string) {
      const e = live(k);
      const next = String((e ? Number(e.value) : 0) + 1);
      store.set(k, { value: next, expireAt: e?.expireAt ?? null });
      return Number(next);
    },
    async expire(k: string, seconds: number) {
      const e = store.get(k);
      if (e) e.expireAt = now() + seconds * 1000;
      return 1;
    },
    async ttl(k: string) {
      const e = live(k);
      if (!e || e.expireAt === null) return -1;
      return Math.ceil((e.expireAt - now()) / 1000);
    },
    async set(k: string, value: string, opts?: { EX?: number }) {
      store.set(k, { value, expireAt: opts?.EX ? now() + opts.EX * 1000 : null });
      return "OK";
    },
    async del(...keys: string[]) {
      let n = 0;
      for (const k of keys) if (store.delete(k)) n++;
      return n;
    },
  };
}

const fakeRedis = vi.hoisted(() => ({ current: null as ReturnType<typeof makeFakeRedis> | null }));

vi.mock("@/lib/redis/connection", () => ({
  getRedisConnection: async () => fakeRedis.current,
}));
vi.mock("@/lib/monitoring/api-alerts", () => ({ alertOtpRateLimitTriggered: vi.fn() }));

import {
  checkOtpVerifyLock,
  registerOtpVerifyFailure,
  clearOtpVerifyFailures,
} from "./otp-rate-limit";

const PHONE = "+79995550000";
const ATTACKER_IP = "203.0.113.7";
const VICTIM_IP = "198.51.100.9";
const FAIL_LIMIT = 5;

beforeEach(() => {
  fakeRedis.current = makeFakeRedis();
});

describe("OTP verify lockout is scoped by (phone + IP)", () => {
  it("locks the abuser's own (phone, IP) after the limit", async () => {
    let last;
    for (let i = 0; i < FAIL_LIMIT; i++) {
      last = await registerOtpVerifyFailure(PHONE, ATTACKER_IP);
    }
    expect(last?.ok).toBe(false);
    expect((last as { error: string }).error).toBe("OTP_LOCKED");

    // Same (phone, attacker-IP) is now locked.
    const attackerLock = await checkOtpVerifyLock(PHONE, ATTACKER_IP);
    expect(attackerLock.ok).toBe(false);
  });

  it("does NOT lock the victim on a different IP — the DoS is removed", async () => {
    for (let i = 0; i < FAIL_LIMIT + 3; i++) {
      await registerOtpVerifyFailure(PHONE, ATTACKER_IP);
    }
    // The victim, logging in from their own IP, is unaffected.
    const victimLock = await checkOtpVerifyLock(PHONE, VICTIM_IP);
    expect(victimLock.ok).toBe(true);
  });

  it("still bounds single-source brute-force to the failure limit", async () => {
    for (let i = 0; i < FAIL_LIMIT - 1; i++) {
      const r = await registerOtpVerifyFailure(PHONE, ATTACKER_IP);
      expect(r.ok).toBe(true); // under the limit
    }
    const atLimit = await registerOtpVerifyFailure(PHONE, ATTACKER_IP);
    expect(atLimit.ok).toBe(false); // the Nth failure locks
  });

  it("clears only the (phone, IP) that succeeded", async () => {
    for (let i = 0; i < FAIL_LIMIT; i++) {
      await registerOtpVerifyFailure(PHONE, ATTACKER_IP);
    }
    await clearOtpVerifyFailures(PHONE, ATTACKER_IP);
    const afterClear = await checkOtpVerifyLock(PHONE, ATTACKER_IP);
    expect(afterClear.ok).toBe(true);
  });
});
