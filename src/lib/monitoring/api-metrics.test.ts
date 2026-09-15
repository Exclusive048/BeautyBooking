import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ADMIN-HEALTH-01 — метрики API панели «Состояние системы».
 *
 * Два слоя: чистая математика (бакеты, p95, uptime) и полный цикл
 * «записать → сбросить в Redis → прочитать» на in-memory двойнике клиента,
 * который поддерживает ровно те команды, что использует модуль.
 *
 * @probe  p95: при 94 быстрых и 6 медленных запросах ожидался бакет
 *         «5000» — с ослабленным порогом (`>` вместо `>=`) тест краснел
 *         на «≤ 50». Uptime: подмена `earliest` на начало окна давала
 *         ratio 0.5 вместо 1 — тест краснел. Флаш: без вызова
 *         `flushApiMetrics` чтение отдавало `requests: 0` — краснел.
 */

type Hash = Map<string, number>;

class FakeRedis {
  hashes = new Map<string, Hash>();
  zsets = new Map<string, Map<string, number>>();
  ttl = new Map<string, number>();
  failNext = false;

  private guard() {
    if (this.failNext) {
      this.failNext = false;
      return Promise.reject(new Error("redis down"));
    }
    return null;
  }

  hIncrBy(key: string, field: string, by: number) {
    const g = this.guard();
    if (g) return g;
    const h = this.hashes.get(key) ?? new Map<string, number>();
    h.set(field, (h.get(field) ?? 0) + by);
    this.hashes.set(key, h);
    return Promise.resolve(h.get(field));
  }
  hGetAll(key: string) {
    const g = this.guard();
    if (g) return g;
    const h = this.hashes.get(key);
    const out: Record<string, string> = {};
    if (h) for (const [k, v] of h) out[k] = String(v);
    return Promise.resolve(out);
  }
  expire(key: string, seconds: number) {
    this.ttl.set(key, seconds);
    return Promise.resolve(true);
  }
  zAdd(key: string, member: { score: number; value: string }) {
    const z = this.zsets.get(key) ?? new Map<string, number>();
    z.set(member.value, member.score);
    this.zsets.set(key, z);
    return Promise.resolve(1);
  }
  zRemRangeByScore(key: string, _min: string | number, max: number) {
    const z = this.zsets.get(key);
    if (!z) return Promise.resolve(0);
    let removed = 0;
    for (const [v, s] of z) {
      if (s <= max) {
        z.delete(v);
        removed += 1;
      }
    }
    return Promise.resolve(removed);
  }
  zCount(key: string, min: number, max: number) {
    const z = this.zsets.get(key);
    if (!z) return Promise.resolve(0);
    let n = 0;
    for (const s of z.values()) if (s >= min && s <= max) n += 1;
    return Promise.resolve(n);
  }
  zRange(key: string, min: number, max: number, opts: { LIMIT: { offset: number; count: number } }) {
    const z = this.zsets.get(key);
    if (!z) return Promise.resolve([] as string[]);
    const sorted = [...z.entries()].filter(([, s]) => s >= min && s <= max).sort((a, b) => a[1] - b[1]);
    return Promise.resolve(sorted.slice(opts.LIMIT.offset, opts.LIMIT.offset + opts.LIMIT.count).map(([v]) => v));
  }
}

const fake = new FakeRedis();
let redisAvailable = true;

vi.mock("@/lib/redis/connection", () => ({
  getRedisConnection: async () => (redisAvailable ? fake : null),
  withRedisCommandTimeout: <T>(_op: string, p: Promise<T>) => p,
}));

vi.mock("@/lib/logging/logger", () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
}));

import {
  API_LATENCY_BOUNDS_MS,
  API_LATENCY_BUCKET_COUNT,
  bucketIndexForDuration,
  computeUptime,
  flushApiMetrics,
  p95FromHistogram,
  readApiMetrics,
  recordApiRequest,
  resetApiMetricsAccumulatorForTests,
  toEpochMinute,
} from "@/lib/monitoring/api-metrics";

describe("bucketIndexForDuration", () => {
  it("границы включительно, хвост открыт", () => {
    expect(bucketIndexForDuration(0)).toBe(0);
    expect(bucketIndexForDuration(5)).toBe(0);
    expect(bucketIndexForDuration(5.1)).toBe(1);
    expect(bucketIndexForDuration(300)).toBe(API_LATENCY_BOUNDS_MS.indexOf(300));
    expect(bucketIndexForDuration(30_000)).toBe(API_LATENCY_BOUNDS_MS.length - 1);
    expect(bucketIndexForDuration(30_001)).toBe(API_LATENCY_BOUNDS_MS.length);
    expect(bucketIndexForDuration(Number.NaN)).toBe(0);
  });
});

describe("p95FromHistogram", () => {
  const empty = () => new Array<number>(API_LATENCY_BUCKET_COUNT).fill(0);

  it("пустая гистограмма — null", () => {
    expect(p95FromHistogram(empty())).toEqual({ p95Ms: null, saturated: false });
  });

  it("95 из 100 в бакете 50 мс → p95 = 50", () => {
    const h = empty();
    h[bucketIndexForDuration(40)] = 95;
    h[bucketIndexForDuration(4000)] = 5;
    expect(p95FromHistogram(h)).toEqual({ p95Ms: 50, saturated: false });
  });

  it("94 из 100 быстрых → квантиль уходит в медленный бакет", () => {
    const h = empty();
    h[bucketIndexForDuration(40)] = 94;
    h[bucketIndexForDuration(4000)] = 6;
    expect(p95FromHistogram(h)).toEqual({ p95Ms: 5000, saturated: false });
  });

  it("квантиль в открытом хвосте → saturated с последней границей", () => {
    const h = empty();
    h[API_LATENCY_BOUNDS_MS.length] = 10;
    expect(p95FromHistogram(h)).toEqual({ p95Ms: 30_000, saturated: true });
  });
});

describe("computeUptime", () => {
  it("наблюдение начинается с первой отметки в окне", () => {
    const r = computeUptime({
      upMinutes: 10,
      earliestMinute: 991,
      windowStartMinute: 1,
      windowEndMinute: 1000,
    });
    expect(r).toEqual({ upMinutes: 10, observedMinutes: 10, ratio: 1 });
  });

  it("простой внутри наблюдаемого отрезка снижает долю", () => {
    const r = computeUptime({
      upMinutes: 30,
      earliestMinute: 941,
      windowStartMinute: 1,
      windowEndMinute: 1000,
    });
    expect(r.observedMinutes).toBe(60);
    expect(r.ratio).toBeCloseTo(0.5);
  });

  it("отметка раньше окна не расширяет наблюдение за окно", () => {
    const r = computeUptime({
      upMinutes: 1000,
      earliestMinute: -5,
      windowStartMinute: 1,
      windowEndMinute: 1000,
    });
    expect(r).toEqual({ upMinutes: 1000, observedMinutes: 1000, ratio: 1 });
  });

  it("нет отметок — ratio null", () => {
    expect(
      computeUptime({ upMinutes: 0, earliestMinute: null, windowStartMinute: 1, windowEndMinute: 10 }),
    ).toEqual({ upMinutes: 0, observedMinutes: 0, ratio: null });
  });
});

describe("record → flush → read", () => {
  const NOW = Date.UTC(2026, 8, 15, 12, 30, 45);

  beforeEach(() => {
    resetApiMetricsAccumulatorForTests();
    fake.hashes.clear();
    fake.zsets.clear();
    fake.ttl.clear();
    redisAvailable = true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("сброшенные запросы читаются с p95 и счётчиком 5xx", async () => {
    for (let i = 0; i < 18; i += 1) recordApiRequest({ durationMs: 42, status: 200 }, NOW);
    recordApiRequest({ durationMs: 2400, status: 500 }, NOW);
    recordApiRequest({ durationMs: 2400, status: 200 }, NOW);

    expect(await flushApiMetrics(NOW)).toBe(true);
    const snap = await readApiMetrics(NOW + 5_000);

    expect(snap.latency.available).toBe(true);
    expect(snap.latency.requests).toBe(20);
    expect(snap.latency.errors5xx).toBe(1);
    expect(snap.latency.p95Ms).toBe(3000);
    expect(snap.latency.saturated).toBe(false);
  });

  it("без сброса чтение ничего не видит — накопитель не является источником", async () => {
    recordApiRequest({ durationMs: 42, status: 200 }, NOW);
    const snap = await readApiMetrics(NOW);
    expect(snap.latency.available).toBe(true);
    expect(snap.latency.requests).toBe(0);
    expect(snap.latency.p95Ms).toBeNull();
  });

  it("запросы старше окна 15 мин не попадают в p95", async () => {
    recordApiRequest({ durationMs: 9000, status: 200 }, NOW - 16 * 60_000);
    recordApiRequest({ durationMs: 10, status: 200 }, NOW);
    await flushApiMetrics(NOW);
    const snap = await readApiMetrics(NOW);
    expect(snap.latency.requests).toBe(1);
    expect(snap.latency.p95Ms).toBe(10);
  });

  it("heartbeat флашера даёт uptime; пропущенные минуты считаются простоем", async () => {
    // Отметки: 10 минут подряд, затем 5 минут тишины, затем текущая минута.
    const base = NOW - 16 * 60_000;
    for (let i = 0; i < 10; i += 1) await flushApiMetrics(base + i * 60_000);
    await flushApiMetrics(NOW);

    const snap = await readApiMetrics(NOW);
    expect(snap.uptime.available).toBe(true);
    // Окно заканчивается на предыдущей минуте (текущая исключена): от первой
    // отметки (−16 мин) до −1 мин — 16 минут наблюдения, 10 с отметкой.
    expect(snap.uptime.observedMinutes).toBe(16);
    expect(snap.uptime.upMinutes).toBe(10);
    expect(snap.uptime.ratio).toBeCloseTo(10 / 16);
  });

  it("одна и та же минута от двух процессов — одна отметка", async () => {
    await flushApiMetrics(NOW - 60_000);
    await flushApiMetrics(NOW - 60_000 + 20_000);
    const snap = await readApiMetrics(NOW);
    expect(snap.uptime.upMinutes).toBe(1);
    expect(snap.uptime.observedMinutes).toBe(1);
  });

  it("Redis недоступен — обе метрики unavailable, ничего не бросает", async () => {
    redisAvailable = false;
    recordApiRequest({ durationMs: 1, status: 200 }, NOW);
    expect(await flushApiMetrics(NOW)).toBe(false);
    const snap = await readApiMetrics(NOW);
    expect(snap.latency.available).toBe(false);
    expect(snap.uptime.available).toBe(false);
  });

  it("отказ команды при сбросе теряет минуту, но не удваивает её на следующем", async () => {
    recordApiRequest({ durationMs: 1, status: 200 }, NOW);
    fake.failNext = true;
    expect(await flushApiMetrics(NOW)).toBe(false);
    recordApiRequest({ durationMs: 1, status: 200 }, NOW);
    expect(await flushApiMetrics(NOW)).toBe(true);
    const snap = await readApiMetrics(NOW);
    expect(snap.latency.requests).toBe(1);
  });

  it("ключи минут получают TTL", async () => {
    recordApiRequest({ durationMs: 1, status: 200 }, NOW);
    await flushApiMetrics(NOW);
    expect(fake.ttl.get(`mon:api:lat:${toEpochMinute(NOW)}`)).toBeGreaterThan(0);
    expect(fake.ttl.get("mon:api:heartbeat")).toBeGreaterThan(0);
  });
});
