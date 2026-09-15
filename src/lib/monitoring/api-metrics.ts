/**
 * ADMIN-HEALTH-01 — собственные метрики API для панели «Состояние системы».
 *
 * До этого строки «API uptime» и «Время ответа p95» были литеральными прочерками:
 * в проекте не существовало ни одного места, где измерялась бы длительность
 * запроса. GlitchTip — трекер ошибок, а не APM (tracing выключен намеренно,
 * см. `instrumentation.ts`), так что брать оттуда нечего. Здесь — минимальный
 * in-house слой из двух измерений:
 *
 *   · **Задержка.** `recordApiRequest` копит в памяти процесса гистограмму
 *     длительностей по фиксированным границам (`API_LATENCY_BOUNDS_MS`) и
 *     счётчики (всего / 5xx) на текущую минуту; флашер раз в 10 с сбрасывает
 *     их в Redis (`HINCRBY` на ключ минуты, TTL 30 мин). p95 считается по
 *     объединённой гистограмме последних 15 минут и является ВЕРХНЕЙ ГРАНИЦЕЙ
 *     бакета — то есть «≤ 300 мс», а не точным квантилем. Точный квантиль
 *     потребовал бы хранить каждую длительность, что на горячем публичном пути
 *     не окупается.
 *
 *   · **Uptime.** Тот же флашер каждые 10 с отмечает текущую минуту в sorted
 *     set `mon:api:heartbeat` (score = epoch-минута). Это heartbeat ПРОЦЕССА:
 *     мёртвый процесс не пишет, и его минуты остаются пустыми. Доля
 *     заполненных минут за 24 ч и есть «uptime». 🔴 Честная граница метрики:
 *     она наблюдается самим приложением, а не внешней пробой, поэтому
 *     недоступный Redis тоже выглядит как простой (писать некуда), а окно
 *     считается от ПЕРВОЙ отметки в нём — свежий деплой не показывает 0 %.
 *
 * Кто зовёт `recordApiRequest` — `http-metrics-hook.ts` (патч `http.Server`,
 * ставится из `src/proxy.ts` при загрузке модуля; почему не из
 * `instrumentation.ts` — объяснено там же): он видит КАЖДЫЙ входящий запрос
 * независимо от того, обёрнут ли роут в `withRequestContext` (таких 17 из
 * 289), поэтому покрытие структурное, а не по соглашению.
 *
 * Все команды Redis — через `withRedisCommandTimeout` (FIX-C4, сторож
 * `redis/command-boundary.test.ts`). Отказ Redis никогда не роняет ни
 * запрос, ни флашер: метрика просто остаётся «—».
 */

import { logError } from "@/lib/logging/logger";
import { getRedisConnection, withRedisCommandTimeout } from "@/lib/redis/connection";

/** Верхние границы бакетов гистограммы (мс). Последний бакет — «больше
 * последней границы». */
export const API_LATENCY_BOUNDS_MS = [
  5, 10, 20, 30, 50, 75, 100, 150, 200, 300, 500, 750, 1000, 1500, 2000, 3000,
  5000, 10000, 30000,
] as const;

export const API_LATENCY_BUCKET_COUNT = API_LATENCY_BOUNDS_MS.length + 1;
export const API_METRICS_FLUSH_INTERVAL_MS = 10_000;
export const API_LATENCY_WINDOW_MINUTES = 15;
export const API_UPTIME_WINDOW_MINUTES = 24 * 60;

const LATENCY_KEY_PREFIX = "mon:api:lat:";
const LATENCY_KEY_TTL_SECONDS = 30 * 60;
const HEARTBEAT_KEY = "mon:api:heartbeat";
const HEARTBEAT_RETENTION_MINUTES = API_UPTIME_WINDOW_MINUTES + 60;
const HEARTBEAT_KEY_TTL_SECONDS = (HEARTBEAT_RETENTION_MINUTES + 60) * 60;
const FIELD_COUNT = "n";
const FIELD_5XX = "e5";
const FIELD_BUCKET_PREFIX = "h";
const FLUSH_ERROR_LOG_INTERVAL_MS = 60_000;

export type ApiRequestSample = {
  durationMs: number;
  status: number;
};

type MinuteAccumulator = {
  count: number;
  errors5xx: number;
  buckets: number[];
};

export type ApiLatencySnapshot = {
  /** false — Redis недоступен, судить не о чем. */
  available: boolean;
  windowMinutes: number;
  requests: number;
  errors5xx: number;
  /** Верхняя граница бакета, в который попал 95-й перцентиль; `null` — в
   * окне не было запросов. */
  p95Ms: number | null;
  /** p95 упёрся в последний (открытый) бакет — реальное значение выше. */
  saturated: boolean;
};

export type ApiUptimeSnapshot = {
  /** false — Redis недоступен либо в окне нет ни одной отметки. */
  available: boolean;
  windowMinutes: number;
  upMinutes: number;
  /** Минут от первой отметки в окне до конца окна. */
  observedMinutes: number;
  /** `upMinutes / observedMinutes`, `null` когда наблюдать нечего. */
  ratio: number | null;
};

export type ApiMetricsSnapshot = {
  latency: ApiLatencySnapshot;
  uptime: ApiUptimeSnapshot;
};

const pendingByMinute = new Map<number, MinuteAccumulator>();
let flushTimer: ReturnType<typeof setInterval> | null = null;
let lastFlushErrorLogAt = 0;

export function toEpochMinute(nowMs: number): number {
  return Math.floor(nowMs / 60_000);
}

/** Индекс бакета для длительности: первый бакет, чья граница ≥ значения;
 * всё, что больше последней границы, — в открытый хвост. */
export function bucketIndexForDuration(durationMs: number): number {
  const value = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 0;
  for (let i = 0; i < API_LATENCY_BOUNDS_MS.length; i += 1) {
    if (value <= API_LATENCY_BOUNDS_MS[i]) return i;
  }
  return API_LATENCY_BOUNDS_MS.length;
}

/**
 * 95-й перцентиль по гистограмме: верхняя граница первого бакета, на котором
 * накопленная сумма достигает ⌈0.95·N⌉. Возвращает `null` при пустой
 * гистограмме; `saturated` — квантиль оказался в открытом хвосте, и тогда
 * `p95Ms` равен последней границе как нижней оценке.
 */
export function p95FromHistogram(buckets: readonly number[]): {
  p95Ms: number | null;
  saturated: boolean;
} {
  const total = buckets.reduce((sum, n) => sum + (n > 0 ? n : 0), 0);
  if (total <= 0) return { p95Ms: null, saturated: false };
  const target = Math.ceil(total * 0.95);
  let cumulative = 0;
  for (let i = 0; i < buckets.length; i += 1) {
    cumulative += buckets[i] > 0 ? buckets[i] : 0;
    if (cumulative >= target) {
      if (i >= API_LATENCY_BOUNDS_MS.length) {
        return {
          p95Ms: API_LATENCY_BOUNDS_MS[API_LATENCY_BOUNDS_MS.length - 1],
          saturated: true,
        };
      }
      return { p95Ms: API_LATENCY_BOUNDS_MS[i], saturated: false };
    }
  }
  return {
    p95Ms: API_LATENCY_BOUNDS_MS[API_LATENCY_BOUNDS_MS.length - 1],
    saturated: true,
  };
}

/**
 * Uptime по отметкам: окно `[windowStartMinute, windowEndMinute]`
 * (обе границы включительно), наблюдение начинается с первой отметки в окне.
 */
export function computeUptime(input: {
  upMinutes: number;
  earliestMinute: number | null;
  windowStartMinute: number;
  windowEndMinute: number;
}): Pick<ApiUptimeSnapshot, "upMinutes" | "observedMinutes" | "ratio"> {
  const { upMinutes, earliestMinute, windowStartMinute, windowEndMinute } = input;
  if (earliestMinute === null || upMinutes <= 0) {
    return { upMinutes: 0, observedMinutes: 0, ratio: null };
  }
  const from = Math.max(earliestMinute, windowStartMinute);
  const observedMinutes = Math.max(0, windowEndMinute - from + 1);
  if (observedMinutes === 0) return { upMinutes: 0, observedMinutes: 0, ratio: null };
  const up = Math.min(upMinutes, observedMinutes);
  return { upMinutes: up, observedMinutes, ratio: up / observedMinutes };
}

function latencyKey(minute: number): string {
  return `${LATENCY_KEY_PREFIX}${minute}`;
}

/** Учесть один завершённый запрос к API. Синхронно, без I/O — зовётся на
 * каждом ответе. */
export function recordApiRequest(sample: ApiRequestSample, nowMs = Date.now()): void {
  const minute = toEpochMinute(nowMs);
  let acc = pendingByMinute.get(minute);
  if (!acc) {
    acc = { count: 0, errors5xx: 0, buckets: new Array<number>(API_LATENCY_BUCKET_COUNT).fill(0) };
    pendingByMinute.set(minute, acc);
  }
  acc.count += 1;
  if (sample.status >= 500) acc.errors5xx += 1;
  acc.buckets[bucketIndexForDuration(sample.durationMs)] += 1;
}

/** Только для тестов: сбросить накопленное в памяти. */
export function resetApiMetricsAccumulatorForTests(): void {
  pendingByMinute.clear();
}

function logFlushError(error: unknown): void {
  const now = Date.now();
  if (now - lastFlushErrorLogAt < FLUSH_ERROR_LOG_INTERVAL_MS) return;
  lastFlushErrorLogAt = now;
  logError("api-metrics flush failed", {
    error: error instanceof Error ? error.message : String(error),
    __skipAlert: true,
  });
}

/**
 * Сбросить накопленное в Redis и отметить heartbeat текущей минуты.
 * Накопитель очищается ДО записи: при отказе Redis данные минуты теряются, и
 * это осознанно — повторная попытка удвоила бы счётчики, а потерянная минута
 * гистограммы дешевле ложного p95.
 */
export async function flushApiMetrics(nowMs = Date.now()): Promise<boolean> {
  const batch = Array.from(pendingByMinute.entries());
  pendingByMinute.clear();
  const currentMinute = toEpochMinute(nowMs);

  try {
    const client = await getRedisConnection();
    if (!client) return false;

    const writes: Promise<unknown>[] = [];
    for (const [minute, acc] of batch) {
      const key = latencyKey(minute);
      writes.push(
        withRedisCommandTimeout(`api-metrics:hIncrBy:${FIELD_COUNT}`, client.hIncrBy(key, FIELD_COUNT, acc.count)),
      );
      if (acc.errors5xx > 0) {
        writes.push(
          withRedisCommandTimeout(`api-metrics:hIncrBy:${FIELD_5XX}`, client.hIncrBy(key, FIELD_5XX, acc.errors5xx)),
        );
      }
      acc.buckets.forEach((n, i) => {
        if (n <= 0) return;
        writes.push(
          withRedisCommandTimeout(
            "api-metrics:hIncrBy:bucket",
            client.hIncrBy(key, `${FIELD_BUCKET_PREFIX}${i}`, n),
          ),
        );
      });
      writes.push(withRedisCommandTimeout("api-metrics:expire", client.expire(key, LATENCY_KEY_TTL_SECONDS)));
    }

    writes.push(
      withRedisCommandTimeout(
        "api-metrics:heartbeat:zAdd",
        client.zAdd(HEARTBEAT_KEY, { score: currentMinute, value: String(currentMinute) }),
      ),
      withRedisCommandTimeout(
        "api-metrics:heartbeat:trim",
        client.zRemRangeByScore(HEARTBEAT_KEY, "-inf", currentMinute - HEARTBEAT_RETENTION_MINUTES),
      ),
      withRedisCommandTimeout(
        "api-metrics:heartbeat:expire",
        client.expire(HEARTBEAT_KEY, HEARTBEAT_KEY_TTL_SECONDS),
      ),
    );

    await Promise.all(writes);
    return true;
  } catch (error) {
    logFlushError(error);
    return false;
  }
}

/** Запустить периодический флашер (идемпотентно). Таймер `unref` — не
 * держит процесс при завершении. */
export function startApiMetricsFlusher(intervalMs = API_METRICS_FLUSH_INTERVAL_MS): boolean {
  if (flushTimer) return false;
  flushTimer = setInterval(() => {
    void flushApiMetrics();
  }, intervalMs);
  flushTimer.unref?.();
  return true;
}

export function stopApiMetricsFlusher(): void {
  if (!flushTimer) return;
  clearInterval(flushTimer);
  flushTimer = null;
}

function parseIntField(record: Record<string, string>, field: string): number {
  const raw = record[field];
  if (raw === undefined) return 0;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function unavailableSnapshot(): ApiMetricsSnapshot {
  return {
    latency: {
      available: false,
      windowMinutes: API_LATENCY_WINDOW_MINUTES,
      requests: 0,
      errors5xx: 0,
      p95Ms: null,
      saturated: false,
    },
    uptime: {
      available: false,
      windowMinutes: API_UPTIME_WINDOW_MINUTES,
      upMinutes: 0,
      observedMinutes: 0,
      ratio: null,
    },
  };
}

/** Прочитать сводку для панели. Никогда не бросает. */
export async function readApiMetrics(nowMs = Date.now()): Promise<ApiMetricsSnapshot> {
  try {
    const client = await getRedisConnection();
    if (!client) return unavailableSnapshot();

    const currentMinute = toEpochMinute(nowMs);

    // Задержка: текущая минута + предыдущие (window − 1).
    const latencyMinutes: number[] = [];
    for (let i = 0; i < API_LATENCY_WINDOW_MINUTES; i += 1) {
      latencyMinutes.push(currentMinute - i);
    }

    // Uptime: текущая минута исключена — её heartbeat может ещё не быть
    // записан (флашер идёт раз в 10 с).
    const windowEndMinute = currentMinute - 1;
    const windowStartMinute = windowEndMinute - API_UPTIME_WINDOW_MINUTES + 1;

    const [latencyRecords, upMinutes, earliest] = await Promise.all([
      Promise.all(
        latencyMinutes.map((minute) =>
          withRedisCommandTimeout("api-metrics:hGetAll", client.hGetAll(latencyKey(minute))),
        ),
      ),
      withRedisCommandTimeout(
        "api-metrics:heartbeat:zCount",
        client.zCount(HEARTBEAT_KEY, windowStartMinute, windowEndMinute),
      ),
      withRedisCommandTimeout(
        "api-metrics:heartbeat:earliest",
        client.zRange(HEARTBEAT_KEY, windowStartMinute, windowEndMinute, {
          BY: "SCORE",
          LIMIT: { offset: 0, count: 1 },
        }),
      ),
    ]);

    const merged = new Array<number>(API_LATENCY_BUCKET_COUNT).fill(0);
    let requests = 0;
    let errors5xx = 0;
    for (const record of latencyRecords) {
      const rec = (record ?? {}) as Record<string, string>;
      requests += parseIntField(rec, FIELD_COUNT);
      errors5xx += parseIntField(rec, FIELD_5XX);
      for (let i = 0; i < API_LATENCY_BUCKET_COUNT; i += 1) {
        merged[i] += parseIntField(rec, `${FIELD_BUCKET_PREFIX}${i}`);
      }
    }
    const { p95Ms, saturated } = p95FromHistogram(merged);

    const earliestRaw = Array.isArray(earliest) && earliest.length > 0 ? String(earliest[0]) : null;
    const earliestMinute =
      earliestRaw !== null && Number.isFinite(Number.parseInt(earliestRaw, 10))
        ? Number.parseInt(earliestRaw, 10)
        : null;
    const uptime = computeUptime({
      upMinutes: typeof upMinutes === "number" ? upMinutes : 0,
      earliestMinute,
      windowStartMinute,
      windowEndMinute,
    });

    return {
      latency: {
        available: true,
        windowMinutes: API_LATENCY_WINDOW_MINUTES,
        requests,
        errors5xx,
        p95Ms,
        saturated,
      },
      uptime: {
        available: uptime.ratio !== null,
        windowMinutes: API_UPTIME_WINDOW_MINUTES,
        ...uptime,
      },
    };
  } catch (error) {
    logError("api-metrics read failed", {
      error: error instanceof Error ? error.message : String(error),
      __skipAlert: true,
    });
    return unavailableSnapshot();
  }
}
