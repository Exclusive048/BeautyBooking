import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * WORKER-LIVENESS-ALERT — наблюдатель воркера в процессе приложения.
 *
 * Отметку читает настоящий `readWorkerLiveness` (с настоящим порогом и
 * классификацией) поверх двойника Redis, поэтому тест видит и решение, и
 * границу «2 мин» ровно ту, что у роутов здоровья. Наружу проверяется только
 * факт вызова `alertWorkerDown` — паузу и доставку держат свои тесты
 * (`alert-cooldown.test.ts`).
 *
 * @probe  Снята проверка `liveness === null` в `decideWorkerLivenessAlert`
 *         (обрыв Redis проваливался в ветку алерта через `liveness?.state`) —
 *         красные «Redis не ответил — молчим» в обоих describe: решение
 *         `{ kind: "alert", lastPingAgoSec: null }` вместо `skip`, и
 *         `alertWorkerDown` вызван с `null`.
 * @probe  `unknown` приравнено к `alive` (молчать, когда отметки нет) —
 *         красный «отметка пропала (ключ истёк) — алерт без возраста»:
 *         воркер, умерший больше 5 мин назад, переставал быть виден.
 * @probe  Прогрев убран (`watchedForMs` не проверяется) — красный «первые две
 *         минуты после старта процесса — молчим».
 * @probe  `startWorkerLivenessWatch` без `setInterval` (только сохраняет время
 *         старта) — красный «таймер раз в минуту читает отметку»: ни одного
 *         чтения после трёх минут.
 */

let pingValue: string | null = null;
let redisMode: "ok" | "no-client" | "throws" = "ok";
const getCalls: string[] = [];

vi.mock("@/lib/redis/connection", () => ({
  getRedisConnection: async () => {
    if (redisMode === "no-client") return null;
    return {
      get: async (key: string) => {
        getCalls.push(key);
        if (redisMode === "throws") throw new Error("REDIS_COMMAND_TIMEOUT");
        return pingValue;
      },
    };
  },
  withRedisCommandTimeout: <T>(_op: string, p: Promise<T>) => p,
}));

const alertWorkerDown = vi.fn();
vi.mock("@/lib/monitoring/api-alerts", () => ({
  alertWorkerDown: (sec: number | null) => alertWorkerDown(sec),
}));

import { WORKER_ALIVE_THRESHOLD_MS, WORKER_LAST_PING_KEY } from "@/lib/queue/worker-liveness";
import {
  WORKER_LIVENESS_CHECK_INTERVAL_MS,
  WORKER_LIVENESS_WARMUP_MS,
  checkWorkerLivenessOnce,
  decideWorkerLivenessAlert,
  startWorkerLivenessWatch,
  stopWorkerLivenessWatch,
} from "@/lib/monitoring/worker-liveness-alert";

const NOW = 1_800_000_000_000;
const STARTED_LONG_AGO = NOW - 10 * 60_000;

beforeEach(() => {
  pingValue = null;
  redisMode = "ok";
  getCalls.length = 0;
  alertWorkerDown.mockReset();
});

afterEach(() => {
  stopWorkerLivenessWatch();
  vi.useRealTimers();
});

describe("decideWorkerLivenessAlert", () => {
  const watched = WORKER_LIVENESS_WARMUP_MS + 1;

  it("Redis не ответил — молчим: о воркере судить нечем", () => {
    expect(decideWorkerLivenessAlert({ liveness: null, watchedForMs: watched })).toEqual({
      kind: "skip",
      reason: "redis-unavailable",
    });
  });

  it("воркер жив — молчим", () => {
    expect(
      decideWorkerLivenessAlert({ liveness: { state: "alive", lastPingAgoMs: 12_000 }, watchedForMs: watched }),
    ).toEqual({ kind: "skip", reason: "alive" });
  });

  it("отметка протухла — алерт с возрастом в секундах", () => {
    expect(
      decideWorkerLivenessAlert({ liveness: { state: "stale", lastPingAgoMs: 185_900 }, watchedForMs: watched }),
    ).toEqual({ kind: "alert", lastPingAgoSec: 185 });
  });

  it("отметка пропала (ключ истёк) — алерт без возраста", () => {
    expect(
      decideWorkerLivenessAlert({ liveness: { state: "unknown", lastPingAgoMs: null }, watchedForMs: watched }),
    ).toEqual({ kind: "alert", lastPingAgoSec: null });
  });

  it("первые две минуты после старта процесса — молчим, потом алерт", () => {
    const dead = { state: "unknown", lastPingAgoMs: null } as const;
    expect(decideWorkerLivenessAlert({ liveness: dead, watchedForMs: 0 })).toEqual({
      kind: "skip",
      reason: "warming-up",
    });
    expect(decideWorkerLivenessAlert({ liveness: dead, watchedForMs: WORKER_LIVENESS_WARMUP_MS - 1 }).kind).toBe(
      "skip",
    );
    expect(decideWorkerLivenessAlert({ liveness: dead, watchedForMs: WORKER_LIVENESS_WARMUP_MS }).kind).toBe(
      "alert",
    );
  });

  it("прогрев равен порогу живости — один запас на оба вопроса", () => {
    expect(WORKER_LIVENESS_WARMUP_MS).toBe(WORKER_ALIVE_THRESHOLD_MS);
  });
});

describe("checkWorkerLivenessOnce", () => {
  it("читает ту же отметку, что роуты здоровья", async () => {
    pingValue = String(NOW - 5_000);
    await checkWorkerLivenessOnce(NOW, STARTED_LONG_AGO);
    expect(getCalls).toEqual([WORKER_LAST_PING_KEY]);
  });

  it("отметка свежее порога — алерта нет", async () => {
    pingValue = String(NOW - WORKER_ALIVE_THRESHOLD_MS + 1);
    const decision = await checkWorkerLivenessOnce(NOW, STARTED_LONG_AGO);
    expect(decision).toEqual({ kind: "skip", reason: "alive" });
    expect(alertWorkerDown).not.toHaveBeenCalled();
  });

  it("отметка на пороге — алерт с возрастом", async () => {
    pingValue = String(NOW - WORKER_ALIVE_THRESHOLD_MS);
    await checkWorkerLivenessOnce(NOW, STARTED_LONG_AGO);
    expect(alertWorkerDown).toHaveBeenCalledWith(WORKER_ALIVE_THRESHOLD_MS / 1000);
  });

  it("отметки нет — алерт «never»", async () => {
    await checkWorkerLivenessOnce(NOW, STARTED_LONG_AGO);
    expect(alertWorkerDown).toHaveBeenCalledWith(null);
  });

  it("Redis не ответил — молчим (нет клиента и команда упала)", async () => {
    redisMode = "no-client";
    expect(await checkWorkerLivenessOnce(NOW, STARTED_LONG_AGO)).toEqual({
      kind: "skip",
      reason: "redis-unavailable",
    });
    redisMode = "throws";
    expect(await checkWorkerLivenessOnce(NOW, STARTED_LONG_AGO)).toEqual({
      kind: "skip",
      reason: "redis-unavailable",
    });
    expect(alertWorkerDown).not.toHaveBeenCalled();
  });

  it("процесс только что поднялся — мёртвый воркер ещё не алертится", async () => {
    await checkWorkerLivenessOnce(NOW, NOW - 30_000);
    expect(alertWorkerDown).not.toHaveBeenCalled();
  });
});

describe("startWorkerLivenessWatch", () => {
  it("таймер раз в минуту читает отметку и алертит после прогрева", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    expect(startWorkerLivenessWatch()).toBe(true);
    expect(startWorkerLivenessWatch()).toBe(false);

    await vi.advanceTimersByTimeAsync(WORKER_LIVENESS_CHECK_INTERVAL_MS);
    expect(getCalls).toHaveLength(1);
    expect(alertWorkerDown).not.toHaveBeenCalled();

    // Второй тик — ровно на пороге прогрева: уже алерт.
    await vi.advanceTimersByTimeAsync(WORKER_LIVENESS_CHECK_INTERVAL_MS);
    expect(getCalls).toHaveLength(2);
    expect(alertWorkerDown).toHaveBeenCalledTimes(1);
    expect(alertWorkerDown).toHaveBeenCalledWith(null);

    // Каждый следующий тик зовёт снова — окно тишины держит пауза по ключу
    // `worker:down` в `alert-cooldown.ts`, а не наблюдатель.
    await vi.advanceTimersByTimeAsync(WORKER_LIVENESS_CHECK_INTERVAL_MS);
    expect(alertWorkerDown).toHaveBeenCalledTimes(2);
  });

  it("интервал — минута", () => {
    expect(WORKER_LIVENESS_CHECK_INTERVAL_MS).toBe(60_000);
  });
});
