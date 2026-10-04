import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ADMIN-HEALTH-01 — панель «Состояние системы» строится из реальных
 * источников, и каждый известный класс отказа окрашивается.
 *
 * @probe  С удалённой строкой `buildWorkerStat(worker)` из `getAdminHealth`
 *         тест на порядок ключей краснел; с `tone: "ok"` у stale-воркера —
 *         краснел тест «мёртвый воркер красный».
 */

const queueStats = vi.fn();
const reviewCount = vi.fn();
const readApiMetrics = vi.fn();
const readWorkerLiveness = vi.fn();

vi.mock("@/lib/queue/queue", () => ({ getQueueStats: () => queueStats() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    review: { count: () => reviewCount() },
    contentReport: { count: async () => 0 },
    aiSpendCounter: { findMany: async () => [{ meter: "review-reply", count: 450 }] },
  },
}));
vi.mock("@/lib/monitoring/api-metrics", () => ({ readApiMetrics: () => readApiMetrics() }));
vi.mock("@/lib/queue/worker-liveness", () => ({ readWorkerLiveness: () => readWorkerLiveness() }));
const checkDatabase = vi.fn();
const checkRedis = vi.fn();
vi.mock("@/lib/health/probe", () => ({ checkDatabase: () => checkDatabase(), checkRedis: () => checkRedis() }));
vi.mock("@/lib/notifications/notifier", () => ({
  getNotificationsNotifierRuntimeStatus: () => ({ mode: "redis", ready: true, reason: null }),
}));
vi.mock("@/lib/vk/community", () => ({ getVkCommunityAdminView: async () => ({ configured: true, mismatch: false }) }));

import type { ApiMetricsSnapshot } from "@/lib/monitoring/api-metrics";
import {
  buildAiSpendStat,
  buildApiUptimeStat,
  buildDependencyStat,
  buildErrorRateStat,
  buildP95Stat,
  formatUptime,
  buildWorkerStat,
  formatAgo,
  getAdminHealth,
} from "@/features/admin-cabinet/dashboard/server/health.service";

function metrics(over: Partial<{ latency: Partial<ApiMetricsSnapshot["latency"]>; uptime: Partial<ApiMetricsSnapshot["uptime"]> }> = {}): ApiMetricsSnapshot {
  return {
    latency: {
      available: true,
      windowMinutes: 15,
      requests: 120,
      errors5xx: 0,
      p95Ms: 200,
      saturated: false,
      ...over.latency,
    },
    uptime: {
      available: true,
      windowMinutes: 1440,
      upMinutes: 1440,
      observedMinutes: 1440,
      ratio: 1,
      ...over.uptime,
    },
  };
}

describe("getAdminHealth", () => {
  beforeEach(() => {
    queueStats.mockResolvedValue({ pending: 3, processing: 0, dead: 0 });
    reviewCount.mockResolvedValue(0);
    readApiMetrics.mockResolvedValue(metrics());
    readWorkerLiveness.mockResolvedValue({ state: "alive", lastPingAgoMs: 12_000 });
    checkDatabase.mockResolvedValue("ok");
    checkRedis.mockResolvedValue("ok");
  });

  it("порядок строк и группы (ADMIN-HEALTH-02)", async () => {
    const { stats, checkedAt } = await getAdminHealth();
    expect(stats.map((s) => `${s.section}:${s.key}`)).toEqual([
      "platform:apiUptime",
      "platform:p95",
      "platform:errorRate",
      "platform:database",
      "platform:redis",
      "platform:process",
      "queue:worker",
      "queue:queuePending",
      "queue:queueProcessing",
      "queue:queueDead",
      "queue:realtime",
      "integrations:email",
      "integrations:push",
      "integrations:payments",
      "integrations:smsBalance",
      "integrations:vk",
      "integrations:aiSpend",
      "moderation:complaintsOpen",
    ]);
    expect(Number.isNaN(Date.parse(checkedAt))).toBe(false);
  });

  it("БД недоступна — красная строка", async () => {
    checkDatabase.mockResolvedValue("down");
    const { stats } = await getAdminHealth();
    const db = stats.find((s) => s.key === "database");
    expect(db?.tone).toBe("error");
    expect(db?.valueText).toBe("Недоступна");
  });

  it("здоровая система — всё зелёное, кроме заведомо не подключённого SMS", async () => {
    const { stats } = await getAdminHealth();
    const byKey = Object.fromEntries(stats.map((s) => [s.key, s]));
    expect(byKey.apiUptime.tone).toBe("ok");
    expect(byKey.apiUptime.valueText).toBe("100,0 % · 24 ч");
    expect(byKey.p95.tone).toBe("ok");
    expect(byKey.p95.valueText).toBe("≤ 200 мс");
    expect(byKey.worker.tone).toBe("ok");
    expect(byKey.worker.valueText).toContain("12 с назад");
    expect(byKey.queuePending.valueText).toBe("3 ждёт");
    expect(byKey.queueDead.tone).toBe("ok");
    expect(byKey.complaintsOpen.tone).toBe("ok");
    expect(byKey.smsBalance.tone).toBe("error");
  });

  it("мёртвый воркер — красный, даже когда очередь пуста", async () => {
    readWorkerLiveness.mockResolvedValue({ state: "stale", lastPingAgoMs: 40 * 60_000 });
    queueStats.mockResolvedValue({ pending: 0, processing: 0, dead: 0 });
    const { stats } = await getAdminHealth();
    const worker = stats.find((s) => s.key === "worker");
    expect(worker?.tone).toBe("error");
    expect(worker?.valueText).toContain("40 мин назад");
  });

  it("воркер ни разу не отметился — красный «Нет отметки»", async () => {
    readWorkerLiveness.mockResolvedValue({ state: "unknown", lastPingAgoMs: null });
    const { stats } = await getAdminHealth();
    const worker = stats.find((s) => s.key === "worker");
    expect(worker?.tone).toBe("error");
    expect(worker?.valueText).toBe("Нет отметки");
  });

  it("Redis недоступен — очередь, воркер и метрики API нейтральные прочерки", async () => {
    queueStats.mockResolvedValue({ pending: -1, processing: -1, dead: -1 });
    readWorkerLiveness.mockResolvedValue(null);
    readApiMetrics.mockResolvedValue(
      metrics({ latency: { available: false, p95Ms: null }, uptime: { available: false, ratio: null } }),
    );
    const { stats } = await getAdminHealth();
    for (const key of ["apiUptime", "p95", "worker", "queuePending", "queueDead"] as const) {
      const stat = stats.find((s) => s.key === key);
      expect(stat?.tone, key).toBe("neutral");
      expect(stat?.valueText, key).toBe("—");
      expect(stat?.hint, key).toBeTruthy();
    }
  });

  it("жалобы и мёртвые задачи окрашиваются по порогам", async () => {
    queueStats.mockResolvedValue({ pending: 150, processing: 0, dead: 1 });
    reviewCount.mockResolvedValue(6);
    const { stats } = await getAdminHealth();
    const byKey = Object.fromEntries(stats.map((s) => [s.key, s]));
    expect(byKey.queuePending.tone).toBe("warn");
    expect(byKey.queueDead.tone).toBe("error");
    expect(byKey.complaintsOpen.tone).toBe("error");
  });
});

describe("buildP95Stat", () => {
  it("пороги: 500 — warn, 1500 — error, хвост — error с «>»", () => {
    expect(buildP95Stat(metrics({ latency: { p95Ms: 500 } })).tone).toBe("warn");
    expect(buildP95Stat(metrics({ latency: { p95Ms: 1500 } })).tone).toBe("error");
    const sat = buildP95Stat(metrics({ latency: { p95Ms: 30_000, saturated: true } }));
    expect(sat.tone).toBe("error");
    expect(sat.valueText).toBe("> 30 000 мс");
  });

  it("окно без запросов — нейтральное «Нет запросов»", () => {
    const stat = buildP95Stat(metrics({ latency: { p95Ms: null, requests: 0 } }));
    expect(stat.tone).toBe("neutral");
    expect(stat.valueText).toBe("Нет запросов");
  });

  it("подсказка несёт число запросов и 5xx", () => {
    const stat = buildP95Stat(metrics({ latency: { requests: 1234, errors5xx: 7 } }));
    expect(stat.hint).toContain("1 234");
    expect(stat.hint).toContain("5xx 7");
  });
});

describe("buildApiUptimeStat", () => {
  it("пороги: ниже 99,5 % — warn, ниже 98 % — error", () => {
    expect(buildApiUptimeStat(metrics({ uptime: { ratio: 0.994 } })).tone).toBe("warn");
    expect(buildApiUptimeStat(metrics({ uptime: { ratio: 0.979 } })).tone).toBe("error");
    expect(buildApiUptimeStat(metrics({ uptime: { ratio: 0.996 } })).tone).toBe("ok");
  });

  it("подсказка показывает наблюдённые минуты", () => {
    const stat = buildApiUptimeStat(metrics({ uptime: { upMinutes: 58, observedMinutes: 60, ratio: 58 / 60 } }));
    expect(stat.hint).toContain("58 из 60");
  });
});

describe("buildWorkerStat / formatAgo", () => {
  it("возраст форматируется в секундах, минутах и часах", () => {
    expect(formatAgo(9_000)).toBe("9 с назад");
    expect(formatAgo(3 * 60_000)).toBe("3 мин назад");
    expect(formatAgo(5 * 3_600_000)).toBe("5 ч назад");
  });

  it("Redis недоступен — нейтральный прочерк с объяснением", () => {
    const stat = buildWorkerStat(null);
    expect(stat.tone).toBe("neutral");
    expect(stat.hint).toContain("Redis");
  });
});

describe("ADMIN-HEALTH-02 · новые строки", () => {
  it("доля 5xx: 1 % — warn, 5 % — error, без запросов — нейтрально", () => {
    expect(buildErrorRateStat(metrics({ latency: { requests: 100, errors5xx: 1 } })).tone).toBe("warn");
    expect(buildErrorRateStat(metrics({ latency: { requests: 100, errors5xx: 5 } })).tone).toBe("error");
    expect(buildErrorRateStat(metrics({ latency: { requests: 100, errors5xx: 0 } })).valueText).toBe("0,0 %");
    expect(buildErrorRateStat(metrics({ latency: { requests: 0, errors5xx: 0 } })).tone).toBe("neutral");
  });

  it("задержка зависимости: 200 мс — warn, 1000 мс — error; Redis без настройки — warn", () => {
    expect(buildDependencyStat("database", { state: "ok", ms: 12 }).valueText).toBe("Работает · 12 мс");
    expect(buildDependencyStat("database", { state: "ok", ms: 250 }).tone).toBe("warn");
    expect(buildDependencyStat("redis", { state: "ok", ms: 1200 }).tone).toBe("error");
    expect(buildDependencyStat("redis", { state: "disabled", ms: 0 }).tone).toBe("warn");
  });

  it("расход ИИ — по самому загруженному потолку", () => {
    expect(buildAiSpendStat({ "review-reply": 450 }, true).tone).toBe("warn");
    expect(buildAiSpendStat({ "review-reply": 500 }, true).tone).toBe("error");
    expect(buildAiSpendStat({}, true).tone).toBe("ok");
    expect(buildAiSpendStat({}, false).valueText).toBe("ИИ не подключён");
  });

  it("время работы процесса", () => {
    expect(formatUptime(5 * 60)).toBe("5 мин");
    expect(formatUptime(3 * 3600 + 7 * 60)).toBe("3 ч 7 мин");
    expect(formatUptime(2 * 86400 + 5 * 3600)).toBe("2 д 5 ч");
  });
});
