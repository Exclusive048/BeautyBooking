import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * APP-REVIEW-LOGIN-CAP — потолок неверных кодов для адреса App Review с любого
 * IP: 20 за окно 24 ч от первой неудачи, затем режим закрыт до конца окна.
 * Алерт — один на окно, со своим ключом и паузой, без адреса и кода. Redis
 * недоступен — закрыто (fail-closed).
 *
 * Счётчик проверяется на настоящих командах лимитера (`incrWithWindow`: INCR +
 * EXPIRE, срок окна) против Redis-двойника со сроками, а не на моке функций:
 * иначе окно и его самоснятие не проверялись бы вовсе.
 *
 * Как отказ выглядит снаружи (неотличим от неверного кода) —
 * `app-review-login.test.ts`.
 *
 * @probe 2026-10-30 (по одной оси; тексты падений — наблюдавшиеся):
 *   1. В `isAppReviewLoginOpen` `failures < APP_REVIEW_FAIL_LIMIT` заменено на
 *      `<=` → три красных: «девятнадцать неудач — режим открыт; двадцатая…»,
 *      «окно — 24 ч…», «счётчик — по адресу…» («expected true to be false»):
 *      после двадцатой неудачи код ещё сравнивался.
 *   2. В `catch` проверки `return false` заменено на `return true` (форма
 *      «не роняем вход из-за Redis») → красный «сбой Redis на чтении — закрыто»
 *      («expected true to be false»).
 *   3. В `registerAppReviewLoginFailure` `failures === …LIMIT` заменено на
 *      `failures >= …LIMIT` → красный «алерт один на окно…» («expected "vi.fn()"
 *      to be called 1 times, but got 6 times»): алерт уходил на каждую неудачу
 *      после порога, и держала бы его только пауза в 6 ч.
 *   Возвращено — зелёные.
 */

const store = vi.hoisted(() => ({
  values: new Map<string, { value: string; expiresAt: number | null }>(),
  available: true,
  failGet: false,
}));

function live(key: string) {
  const entry = store.values.get(key);
  if (!entry) return null;
  if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
    store.values.delete(key);
    return null;
  }
  return entry;
}

const fakeClient = {
  get: vi.fn(async (key: string) => {
    if (store.failGet) throw new Error("REDIS_COMMAND_TIMEOUT");
    return live(key)?.value ?? null;
  }),
  incr: vi.fn(async (key: string) => {
    const entry = live(key);
    const next = Number(entry?.value ?? 0) + 1;
    store.values.set(key, { value: String(next), expiresAt: entry?.expiresAt ?? null });
    return next;
  }),
  expire: vi.fn(async (key: string, seconds: number, mode?: string) => {
    const entry = live(key);
    if (!entry) return 0;
    if (mode === "NX" && entry.expiresAt !== null) return 0;
    entry.expiresAt = Date.now() + seconds * 1000;
    return 1;
  }),
  ttl: vi.fn(async (key: string) => {
    const entry = live(key);
    if (!entry) return -2;
    if (entry.expiresAt === null) return -1;
    return Math.ceil((entry.expiresAt - Date.now()) / 1000);
  }),
};

const spies = vi.hoisted(() => ({
  sendTelegramAlert: vi.fn(async () => true),
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/redis/connection", () => ({
  getRedisConnection: async () => (store.available ? fakeClient : null),
  withRedisCommandTimeout: (_label: string, promise: Promise<unknown>) => promise,
}));
vi.mock("@/lib/monitoring/alerts", () => ({ sendTelegramAlert: spies.sendTelegramAlert }));
vi.mock("@/lib/monitoring/api-alerts", () => ({ alertOtpRateLimitTriggered: vi.fn() }));
vi.mock("@/lib/logging/logger", () => ({
  getRequestId: () => "req_1",
  logInfo: spies.logInfo,
  logError: spies.logError,
  logWarn: vi.fn(),
}));

import { otpAppReviewFailKey } from "@/lib/auth/otp-rate-limit-keys";
import { isAppReviewLoginOpen, registerAppReviewLoginFailure } from "@/lib/auth/otp-rate-limit";

const REVIEW_EMAIL = "review@masterryadom.ru";
const REVIEW_CODE = "482913";
const DAY_MS = 24 * 60 * 60 * 1000;

async function fail(times: number, email = REVIEW_EMAIL) {
  for (let i = 0; i < times; i += 1) await registerAppReviewLoginFailure(email);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-30T09:00:00.000Z"));
  store.values.clear();
  store.available = true;
  store.failGet = false;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("потолок неверных кодов App Review", () => {
  it("девятнадцать неудач — режим открыт; двадцатая неудача закрывает его", async () => {
    await fail(19);
    expect(await isAppReviewLoginOpen(REVIEW_EMAIL)).toBe(true);
    await fail(1);
    expect(await isAppReviewLoginOpen(REVIEW_EMAIL)).toBe(false);
  });

  it("окно — 24 ч от первой неудачи, неудачи внутри окна его не продлевают; потом режим открывается сам", async () => {
    await fail(1);
    expect(await fakeClient.ttl(otpAppReviewFailKey(REVIEW_EMAIL))).toBe(24 * 60 * 60);
    vi.setSystemTime(Date.now() + 23 * 60 * 60 * 1000);
    await fail(19);
    expect(await isAppReviewLoginOpen(REVIEW_EMAIL)).toBe(false);
    // Через час кончается окно, открытое ПЕРВОЙ неудачей, а не двадцатой.
    vi.setSystemTime(Date.now() + 60 * 60 * 1000);
    expect(await isAppReviewLoginOpen(REVIEW_EMAIL)).toBe(true);
  });

  it("счётчик — по адресу: регистр не важен, другой адрес не затронут", async () => {
    await fail(10, "Review@MasterRyadom.ru");
    await fail(10, REVIEW_EMAIL);
    expect(await isAppReviewLoginOpen(REVIEW_EMAIL)).toBe(false);
    expect(await isAppReviewLoginOpen("other-review@masterryadom.ru")).toBe(true);
  });

  it("алерт один на окно, со своим ключом и паузой; новое окно с новым перебором — новый алерт", async () => {
    await fail(25);
    expect(spies.sendTelegramAlert).toHaveBeenCalledTimes(1);
    const [message, key, cooldownMs] = spies.sendTelegramAlert.mock.calls[0] as unknown as [string, string, number];
    expect(key).toBe("auth:app-review-login:locked");
    expect(cooldownMs).toBe(6 * 60 * 60 * 1000);
    expect(message).toContain("App Review");
    expect(spies.logInfo).toHaveBeenCalledWith("auth.app-review-login.locked", { failures: 20, windowHours: 24 });

    vi.setSystemTime(Date.now() + DAY_MS);
    await fail(20);
    expect(spies.sendTelegramAlert).toHaveBeenCalledTimes(2);
  });

  it("в алерте и логах нет ни адреса, ни кода", async () => {
    await fail(20);
    const out = JSON.stringify([spies.sendTelegramAlert.mock.calls, spies.logInfo.mock.calls, spies.logError.mock.calls]);
    expect(out).not.toContain("review@");
    expect(out).not.toContain(REVIEW_CODE);
  });
});

describe("Redis недоступен — режим закрыт", () => {
  it("нет соединения — закрыто, а неудача не бросает", async () => {
    store.available = false;
    expect(await isAppReviewLoginOpen(REVIEW_EMAIL)).toBe(false);
    await expect(registerAppReviewLoginFailure(REVIEW_EMAIL)).resolves.toBeUndefined();
  });

  it("сбой Redis на чтении — закрыто", async () => {
    store.failGet = true;
    expect(await isAppReviewLoginOpen(REVIEW_EMAIL)).toBe(false);
    expect(spies.logError).toHaveBeenCalledWith("App Review login gate check failed", expect.anything());
  });

  it("нечитаемое значение счётчика — закрыто", async () => {
    store.values.set(otpAppReviewFailKey(REVIEW_EMAIL), { value: "not-a-number", expiresAt: null });
    expect(await isAppReviewLoginOpen(REVIEW_EMAIL)).toBe(false);
  });
});
