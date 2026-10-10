import { createHash } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * OPS-ALERT-COOLDOWN-ON-LOGERROR — у ops-алерта в Telegram есть пауза на ВСЕХ
 * путях, а не только в `sendTelegramAlert`.
 *
 * До фикса `logError` звал `sendAlert` напрямую: одна запись об ошибке — одно
 * сообщение в Telegram (живой случай 2026-10-10: приостановленное хранилище
 * давало ERROR на каждое фото страницы). `api-alerts.ts` к каждому событию
 * слал второй, «подробный» алерт без паузы. Тест гонит НАСТОЯЩИЕ `logError`,
 * `sendTelegramAlert` и `api-alerts` через настоящий `alert-cooldown.ts`;
 * подменены только отправка (`sendAlert`), Redis и окружение.
 *
 * @probe 2026-10-10:
 *   · в `logger.ts` алерт возвращён прямым `void sendAlert(level, …)` — 8
 *     красных, среди них «50 одинаковых ошибок — один алерт» (пришло 50),
 *     «повторы считаются», «под одним текстом — разные группы»;
 *   · проверка `pendingKeys` в `acquireAlertCooldown` выключена — 9 красных:
 *     пачка в одном тике проходила проверку памяти до ответа Redis целиком
 *     (50 алертов; без Redis — по алерту на запись в `api-alerts` тоже);
 *   · `alertWorkerDown` снова шлёт второй `sendAlert("critical", …)` без паузы —
 *     1 красный «опрос health при лежащем воркере — одно сообщение»;
 *   · `connect: false` в логгере заменён на `true` — 2 красных, в том числе
 *     «logError не открывает соединение с Redis».
 *   Восстановлено, 14/14 зелено.
 */

const sendAlert = vi.hoisted(() => vi.fn(async () => undefined));
const redis = vi.hoisted(() => ({
  set: vi.fn(),
  connection: null as Promise<unknown> | null,
  getRedisConnection: vi.fn(),
}));
const envState = vi.hoisted(() => ({ NODE_ENV: "production" }));

vi.mock("@/lib/monitoring/alert", () => ({ sendAlert }));
vi.mock("@/lib/env", () => ({
  env: envState,
  get isProduction() {
    return envState.NODE_ENV === "production";
  },
}));
vi.mock("@/lib/redis/connection", () => ({
  getRedisConnection: redis.getRedisConnection,
  peekRedisConnection: () => redis.connection,
  withRedisCommandTimeout: (_operation: string, promise: Promise<unknown>) => promise,
}));

const T0 = new Date("2026-10-10T10:00:00.000Z");

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

/** Свежий процесс: модульные карты паузы пустые. */
async function loadProcess() {
  vi.resetModules();
  const logger = await import("@/lib/logging/logger");
  const alerts = await import("@/lib/monitoring/alerts");
  const apiAlerts = await import("@/lib/monitoring/api-alerts");
  return { ...logger, ...alerts, ...apiAlerts };
}

/** Сколько раз Redis спросили о паузе ИМЕННО этого ключа (у частоты ошибок — свой). */
function setCallsFor(alertKey: string): number {
  const storeKey = `mon:alert:cooldown:${createHash("sha256").update(alertKey).digest("hex")}`;
  return redis.set.mock.calls.filter(([key]) => key === storeKey).length;
}

function alertCalls(level?: string): Array<[string, string, Record<string, unknown> | undefined]> {
  const calls = sendAlert.mock.calls as unknown as Array<[string, string, Record<string, unknown> | undefined]>;
  return level ? calls.filter(([callLevel]) => callLevel === level) : calls;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  sendAlert.mockClear();
  redis.set.mockReset();
  redis.getRedisConnection.mockReset();
  redis.connection = null;
  envState.NODE_ENV = "production";
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("logError — пауза алерта по тексту сообщения", () => {
  it("50 одинаковых ошибок — один алерт", async () => {
    const { logError } = await loadProcess();
    for (let i = 0; i < 50; i += 1) {
      logError("GET /api/media/file/[id]/crop/[v] failed", { stack: "TenantSuspended" });
    }
    await flush();
    const errors = alertCalls("error");
    expect(errors, "одна причина — одно сообщение, а не по сообщению на запись").toHaveLength(1);
    expect(errors[0]![1]).toBe("GET /api/media/file/[id]/crop/[v] failed");
    // Детали первого случая доезжают, как раньше.
    expect(errors[0]![2]).toMatchObject({ stack: "TenantSuspended" });
    // Остальные 49 пришли, пока решалось, отправлять ли первый, — алерт
    // называет их: одно сообщение, но видно, что ошибок было пятьдесят.
    expect(errors[0]![2]).toMatchObject({ suppressedRepeats: 49 });
  });

  it("разные тексты — разные алерты", async () => {
    const { logError } = await loadProcess();
    logError("Redis client error");
    logError("GET /api/feed/home failed");
    logError("Redis client error");
    await flush();
    expect(alertCalls("error").map(([, message]) => message)).toEqual([
      "Redis client error",
      "GET /api/feed/home failed",
    ]);
  });

  it("повторы считаются: следующий алерт после паузы несёт их число", async () => {
    const { logError } = await loadProcess();
    logError("worker job failed");
    await flush();
    expect(alertCalls("error")[0]![2]).not.toHaveProperty("suppressedRepeats");
    for (let i = 0; i < 49; i += 1) logError("worker job failed");
    await flush();
    vi.setSystemTime(new Date(T0.getTime() + 4 * 60_000));
    logError("worker job failed");
    await flush();
    expect(alertCalls("error"), "пауза пять минут ещё не прошла").toHaveLength(1);

    vi.setSystemTime(new Date(T0.getTime() + 5 * 60_000 + 1));
    logError("worker job failed");
    await flush();
    const errors = alertCalls("error");
    expect(errors).toHaveLength(2);
    expect(errors[1]![2]).toMatchObject({ suppressedRepeats: 50 });
  });

  it("под одним текстом — разные группы (`__alertGroup`) не глушат друг друга", async () => {
    const { logError } = await loadProcess();
    logError("[client-error-boundary]", { message: "a is undefined", __alertGroup: "a is undefined" });
    logError("[client-error-boundary]", { message: "a is undefined", __alertGroup: "a is undefined" });
    logError("[client-error-boundary]", { message: "b is null", __alertGroup: "b is null" });
    await flush();
    const errors = alertCalls("error");
    expect(errors).toHaveLength(2);
    // Служебное поле в текст алерта не попадает.
    expect(errors[0]![2]).not.toHaveProperty("__alertGroup");
  });

  it("частота ошибок — критический алерт один раз за окно, а не на каждую ошибку сверх порога", async () => {
    const { logError } = await loadProcess();
    for (let i = 0; i < 20; i += 1) logError(`distinct failure ${i}`);
    await flush();
    const critical = alertCalls("critical");
    expect(critical).toHaveLength(1);
    expect(critical[0]![1]).toBe("Высокая частота ошибок API");
  });

  it("`__skipAlert` по-прежнему молчит", async () => {
    const { logError } = await loadProcess();
    logError("handled 5xx", { __skipAlert: true });
    await flush();
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it("вне production — ни алерта, ни обращения к Redis", async () => {
    envState.NODE_ENV = "development";
    redis.connection = Promise.resolve({ set: redis.set });
    const { logError, sendTelegramAlert } = await loadProcess();
    logError("anything");
    await expect(sendTelegramAlert("ops")).resolves.toBe(false);
    await flush();
    expect(sendAlert).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
    expect(redis.getRedisConnection).not.toHaveBeenCalled();
  });
});

describe("общая пауза между процессами (Redis)", () => {
  it("ключ взят другим процессом — этот молчит и не спрашивает Redis на каждую запись", async () => {
    redis.connection = Promise.resolve({ set: redis.set });
    redis.set.mockResolvedValueOnce("OK").mockResolvedValue(null);

    const processA = await loadProcess();
    processA.logError("Redis client error");
    await flush();
    expect(alertCalls("error")).toHaveLength(1);

    const processB = await loadProcess();
    for (let i = 0; i < 30; i += 1) processB.logError("Redis client error");
    await flush();
    expect(alertCalls("error"), "процесс B — на паузе, взятой процессом A").toHaveLength(1);
    // Redis спросили дважды: процесс A и первая запись процесса B. Остальные 29
    // записи пачки — по памяти процесса, как и запись после неё.
    expect(setCallsFor("log-error:Redis client error")).toBe(2);
    processB.logError("Redis client error");
    await flush();
    expect(setCallsFor("log-error:Redis client error")).toBe(2);
  });

  it("logError не открывает соединение с Redis — только пользуется открытым", async () => {
    const { logError } = await loadProcess();
    logError("deploy:post step failed");
    await flush();
    expect(redis.getRedisConnection).not.toHaveBeenCalled();
    // Без соединения пауза держится в памяти, алерт уходит.
    expect(alertCalls("error")).toHaveLength(1);
  });

  it("сбой Redis на паузе — пауза в памяти, алерт не теряется и не множится", async () => {
    redis.connection = Promise.resolve({ set: redis.set });
    redis.set.mockRejectedValue(Object.assign(new Error("timeout"), { code: "REDIS_COMMAND_TIMEOUT" }));
    const { logError } = await loadProcess();
    for (let i = 0; i < 10; i += 1) logError("Redis client error");
    await flush();
    expect(alertCalls("error")).toHaveLength(1);
  });

  it("sendTelegramAlert, как и раньше, открывает соединение сам", async () => {
    redis.getRedisConnection.mockResolvedValue({ set: redis.set });
    redis.set.mockResolvedValue("OK");
    const { sendTelegramAlert } = await loadProcess();
    await expect(sendTelegramAlert("Хранилище не отвечает", "storage:unavailable:x")).resolves.toBe(true);
    expect(redis.getRedisConnection).toHaveBeenCalled();
    expect(alertCalls("warning")).toHaveLength(1);
  });
});

describe("api-alerts — одно сообщение на событие", () => {
  it("опрос health при лежащем воркере — одно сообщение за паузу, а не два на каждый опрос", async () => {
    const { alertWorkerDown } = await loadProcess();
    for (let i = 0; i < 10; i += 1) alertWorkerDown(120 + i);
    await flush();
    expect(sendAlert).toHaveBeenCalledTimes(1);
    expect(alertCalls("critical")[0]![1]).toContain("Worker не отвечает");
  });

  it("перебор OTP — одно сообщение в минуту, номер замаскирован", async () => {
    const { alertOtpRateLimitTriggered } = await loadProcess();
    for (let i = 0; i < 25; i += 1) alertOtpRateLimitTriggered("203.0.113.7", "+79991234567");
    await flush();
    expect(sendAlert).toHaveBeenCalledTimes(1);
    expect(alertCalls("warning")[0]![2]).toMatchObject({ phone: "+799****" });
  });

  it("5xx сверх порога — один критический алерт", async () => {
    const { track5xxError } = await loadProcess();
    for (let i = 0; i < 12; i += 1) track5xxError("/api/x", `req-${i}`, "boom");
    await flush();
    expect(sendAlert).toHaveBeenCalledTimes(1);
    expect(alertCalls("critical")[0]![1]).toContain("5xx");
  });
});
