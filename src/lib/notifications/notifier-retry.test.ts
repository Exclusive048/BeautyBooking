import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * RES-02 — нотифаер создавался eager-константой на module-eval и кэшировался
 * НАВСЕГДА. Redis, недоступный ровно в этот момент (его рестарт, гонка при
 * деплое — `depends_on: service_healthy` страхует только первый старт), оставлял
 * отклонённый промис до конца жизни процесса: `createNotifier` больше не
 * вызывался, и восстановление Redis ничего не меняло.
 *
 * Цена — SSE отдаёт 503 всем пользователям, `publish` не работает, а in-app
 * уведомления это единственный всегда включённый канал (Telegram погашен,
 * push опционален). Отдельно ломался runbook `redis-down.md`: он предлагает
 * ждать `notifier.mode = "redis"` как признак устранения инцидента, а без
 * рестарта контейнера этот признак не появился бы никогда.
 */

const getRedisConnection = vi.hoisted(() => vi.fn());
const getRedisSubscriberConnection = vi.hoisted(() => vi.fn());

vi.mock("@/lib/redis/connection", () => ({
  getRedisConnection,
  getRedisSubscriberConnection,
}));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));
// В проде memory-fallback запрещён — именно там отказ и становится жёстким.
vi.mock("@/lib/env", () => ({ isProduction: true }));

import {
  NOTIFIER_RETRY_COOLDOWN_MS,
  getNotificationsNotifier,
  getNotificationsNotifierRuntimeStatus,
  resetNotificationsNotifierForTests,
} from "@/lib/notifications/notifier";

function fakeRedisClient() {
  return {
    publish: vi.fn().mockResolvedValue(1),
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  resetNotificationsNotifierForTests();
  getRedisConnection.mockReset();
  getRedisSubscriberConnection.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("нотифаер переживает транзиентный отказ Redis (RES-02)", () => {
  it("после отказа следующая попытка (за кулдауном) действительно пробует снова", async () => {
    getRedisConnection.mockResolvedValue(null);
    getRedisSubscriberConnection.mockResolvedValue(null);

    await expect(getNotificationsNotifier()).rejects.toThrow();
    expect(getNotificationsNotifierRuntimeStatus().mode).toBe("unavailable");

    // Redis вернулся.
    getRedisConnection.mockResolvedValue(fakeRedisClient());
    getRedisSubscriberConnection.mockResolvedValue(fakeRedisClient());
    vi.advanceTimersByTime(NOTIFIER_RETRY_COOLDOWN_MS + 1);

    await expect(getNotificationsNotifier()).resolves.toBeTruthy();
    // Именно этот признак ждёт runbook redis-down.md.
    expect(getNotificationsNotifierRuntimeStatus()).toMatchObject({
      mode: "redis",
      ready: true,
    });
  });

  it("внутри кулдауна лежащий Redis не долбится на каждый вызов", async () => {
    getRedisConnection.mockResolvedValue(null);
    getRedisSubscriberConnection.mockResolvedValue(null);

    await expect(getNotificationsNotifier()).rejects.toThrow();
    const afterFirst = getRedisConnection.mock.calls.length;

    for (let i = 0; i < 5; i += 1) {
      await expect(getNotificationsNotifier()).rejects.toThrow();
    }
    // Ни одной новой попытки подключения — отказ отдаётся из памяти.
    expect(getRedisConnection.mock.calls.length).toBe(afterFirst);
  });

  it("успешный нотифаер кэшируется — рабочее соединение не пересоздаётся", async () => {
    getRedisConnection.mockResolvedValue(fakeRedisClient());
    getRedisSubscriberConnection.mockResolvedValue(fakeRedisClient());

    const first = await getNotificationsNotifier();
    vi.advanceTimersByTime(NOTIFIER_RETRY_COOLDOWN_MS * 10);
    const second = await getNotificationsNotifier();

    expect(second).toBe(first);
    expect(getRedisConnection.mock.calls.length).toBe(1);
  });
});
