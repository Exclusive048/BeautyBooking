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
  // RES-11: команды модуля идут через обёртку с command-таймаутом. Здесь она
  // сквозная — предмет этих тестов ключи и бюджеты, а не поведение при
  // brownout'е (оно в `otp-rate-limit-timeout.test.ts`).
  withRedisCommandTimeout: <T>(_operation: string, promise: Promise<T>) => promise,
}));
vi.mock("@/lib/monitoring/api-alerts", () => ({ alertOtpRateLimitTriggered: vi.fn() }));

import {
  checkOtpEmailRequestRateLimit,
  checkOtpRequestRateLimit,
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

/**
 * SEC-26 — тот же класс на стороне ВЫПУСКА кода. Бюджет запросов ключевался
 * только идентичностью (`otp:request:phone:<hash>`, 3 / 5 мин), поэтому третье
 * лицо, знающее номер, сжигало его целиком и на пять минут лишало владельца
 * возможности получить код.
 *
 * Скопировать verify-решение нельзя: request отправляет SMS/письмо, и ключ
 * `(идентичность, IP)` БЕЗ глобального потолка открыл бы бомбардировку жертвы
 * за наш счёт. Поэтому измерения два, и тесты обязаны удержать оба: снятие
 * блокировки владельца И сохранение потолка отправок.
 */
describe("SEC-26 — выпуск кода ограничен в двух измерениях", () => {
  const IDENTITY_IP_LIMIT = 3;
  const IDENTITY_LIMIT = 10;

  it("чужой источник сжигает СВОЙ бюджет, а не бюджет владельца", async () => {
    for (let i = 0; i < IDENTITY_IP_LIMIT; i++) {
      const r = await checkOtpRequestRateLimit({ phone: PHONE, ip: ATTACKER_IP });
      expect(r.ok).toBe(true);
    }
    const attackerBlocked = await checkOtpRequestRateLimit({ phone: PHONE, ip: ATTACKER_IP });
    expect(attackerBlocked.ok).toBe(false);

    // Владелец со своего IP по-прежнему получает код — это и есть находка.
    const victim = await checkOtpRequestRateLimit({ phone: PHONE, ip: VICTIM_IP });
    expect(victim.ok).toBe(true);
  });

  it("один источник по-прежнему ограничен тремя запросами за 5 минут", async () => {
    for (let i = 0; i < IDENTITY_IP_LIMIT; i++) {
      expect((await checkOtpRequestRateLimit({ phone: PHONE, ip: ATTACKER_IP })).ok).toBe(true);
    }
    expect((await checkOtpRequestRateLimit({ phone: PHONE, ip: ATTACKER_IP })).ok).toBe(false);
  });

  it("потолок отправок на номер сохраняется — распределённая бомбардировка не проходит", async () => {
    // по одному запросу с каждого из десяти адресов: per-IP лимит не при чём,
    // per-(идентичность, IP) тоже — упереться должно ровно в потолок идентичности
    for (let i = 0; i < IDENTITY_LIMIT; i++) {
      const r = await checkOtpRequestRateLimit({ phone: PHONE, ip: `203.0.113.${i + 10}` });
      expect(r.ok).toBe(true);
    }
    const eleventh = await checkOtpRequestRateLimit({ phone: PHONE, ip: "203.0.113.99" });
    expect(eleventh.ok).toBe(false);
  });

  it("бюджеты разных номеров не пересекаются", async () => {
    for (let i = 0; i < IDENTITY_IP_LIMIT; i++) {
      await checkOtpRequestRateLimit({ phone: PHONE, ip: ATTACKER_IP });
    }
    const otherPhone = await checkOtpRequestRateLimit({ phone: "+79995550001", ip: ATTACKER_IP });
    expect(otherPhone.ok).toBe(true);
  });

  it("per-IP лимит жив: один адрес не перебирает номера пачками", async () => {
    // 5 / 60 с на IP — шестой запрос с того же адреса блокируется даже при
    // разных номерах
    for (let i = 0; i < 5; i++) {
      const r = await checkOtpRequestRateLimit({ phone: `+7999555000${i}`, ip: ATTACKER_IP });
      expect(r.ok).toBe(true);
    }
    const sixth = await checkOtpRequestRateLimit({ phone: "+79995550009", ip: ATTACKER_IP });
    expect(sixth.ok).toBe(false);
  });
});

/**
 * SEC-26 — email-близнец. Дефект был тот же (бюджет по адресу), а канал в
 * закрытом деплое ЕДИНСТВЕННЫЙ рабочий: `PHONE_AUTH_ENABLED` в проде off.
 * Починить только телефонный лимит значило бы закрыть спящую дверь и оставить
 * живую, поэтому оба измерения проверяются и здесь.
 */
describe("SEC-26 — выпуск email-кода ограничен в двух измерениях", () => {
  const EMAIL = "victim@example.com";

  it("чужой источник сжигает СВОЙ бюджет, а не бюджет владельца адреса", async () => {
    for (let i = 0; i < 3; i++) {
      expect((await checkOtpEmailRequestRateLimit({ email: EMAIL, ip: ATTACKER_IP })).ok).toBe(true);
    }
    expect((await checkOtpEmailRequestRateLimit({ email: EMAIL, ip: ATTACKER_IP })).ok).toBe(false);
    expect((await checkOtpEmailRequestRateLimit({ email: EMAIL, ip: VICTIM_IP })).ok).toBe(true);
  });

  it("потолок отправок на адрес сохраняется", async () => {
    for (let i = 0; i < 10; i++) {
      const r = await checkOtpEmailRequestRateLimit({ email: EMAIL, ip: `198.51.100.${i + 20}` });
      expect(r.ok).toBe(true);
    }
    expect((await checkOtpEmailRequestRateLimit({ email: EMAIL, ip: "198.51.100.99" })).ok).toBe(false);
  });

  it("регистр адреса не создаёт второй бюджет", async () => {
    for (let i = 0; i < 3; i++) {
      await checkOtpEmailRequestRateLimit({ email: EMAIL, ip: ATTACKER_IP });
    }
    const upper = await checkOtpEmailRequestRateLimit({
      email: EMAIL.toUpperCase(),
      ip: ATTACKER_IP,
    });
    expect(upper.ok).toBe(false);
  });
});
