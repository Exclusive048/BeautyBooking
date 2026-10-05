import "server-only";

import { prisma } from "@/lib/prisma";
import { AI_SPEND_CEILINGS, utcDayKey, type AiSpendMeter } from "@/lib/ai/spend-ceiling";
import {
  isAiFeaturesEnabled,
  isEmailConfigured,
  isPaymentsEnabled,
  isPushEnabled,
  isSmsConfigured,
} from "@/lib/env";
import { checkDatabase, checkRedis, type DependencyState } from "@/lib/health/probe";
import { getNotificationsNotifierRuntimeStatus } from "@/lib/notifications/notifier";
import { getVkCommunityAdminView } from "@/lib/vk/community";
import { readApiMetrics } from "@/lib/monitoring/api-metrics";
import type { ApiMetricsSnapshot } from "@/lib/monitoring/api-metrics";
import { getQueueStats } from "@/lib/queue/queue";
import { readWorkerLiveness } from "@/lib/queue/worker-liveness";
import type { WorkerLiveness } from "@/lib/queue/worker-liveness";
import { ACTIVE_REVIEW_FILTER } from "@/lib/reviews/soft-delete";
import * as UI_TEXT from "@/lib/ui/text";
import type {
  AdminHealth,
  AdminHealthStat,
  AdminHealthTone,
} from "@/features/admin-cabinet/dashboard/types";
import { UI_FMT } from "@/lib/ui/fmt";

const T = UI_TEXT.adminPanel.dashboard.health;

/**
 * ADMIN-HEALTH-01 — пороги панели. Подобраны так, чтобы здоровая система
 * была зелёной по всем строкам, а известные классы отказов — красными:
 *   · воркер без свежей отметки — красный сразу (порог 2 мин совпадает с
 *     `/api/health/status`);
 *   · любая мёртвая задача — красный;
 *   · p95 ≥ 1.5 с — красный (SSR-загрузчики витрины при молчащем Redis
 *     давали 9–20 с, FIX-C4);
 *   · uptime < 98 % за сутки — красный (≈ 29 минут простоя).
 */
export const HEALTH_THRESHOLDS = {
  queuePending: { warn: 100, error: 500 },
  queueDead: { error: 1 },
  complaints: { warn: 1, error: 6 },
  p95Ms: { warn: 500, error: 1500 },
  uptimeRatio: { warn: 0.995, error: 0.98 },
  /** ADMIN-HEALTH-02: доля 5xx за окно задержки, %. */
  errorRatePercent: { warn: 1, error: 5 },
  /** Ответ БД / Redis на пробу, мс. */
  dependencyMs: { warn: 200, error: 1000 },
  queueProcessing: { warn: 20, error: 50 },
  /** Доля суточного потолка ИИ у самого загруженного счётчика. */
  aiSpendRatio: { warn: 0.8, error: 1 },
} as const;

function toneForRange(
  value: number,
  warnAt?: number,
  errorAt?: number,
): AdminHealthTone {
  if (errorAt !== undefined && value >= errorAt) return "error";
  if (warnAt !== undefined && value >= warnAt) return "warn";
  return "ok";
}

/** Для метрик, где ХУЖЕ — это МЕНЬШЕ (uptime). */
function toneForFloor(value: number, warnBelow: number, errorBelow: number): AdminHealthTone {
  if (value < errorBelow) return "error";
  if (value < warnBelow) return "warn";
  return "ok";
}

export function formatAgo(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return T.agoSeconds(seconds);
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return T.agoMinutes(minutes);
  return T.agoHours(Math.floor(minutes / 60));
}

function unavailableStat(
  key: AdminHealthStat["key"],
  section: AdminHealthStat["section"],
  hint: string = T.metricUnavailableHint,
): AdminHealthStat {
  return { key, section, valueText: T.metricUnavailable, tone: "neutral", hint };
}

export function buildApiUptimeStat(metrics: ApiMetricsSnapshot): AdminHealthStat {
  const { uptime } = metrics;
  if (!uptime.available || uptime.ratio === null) {
    return unavailableStat("apiUptime", "platform", T.noDataYetHint);
  }
  const percent = uptime.ratio * 100;
  return {
    key: "apiUptime",
    section: "platform",
    valueText: T.uptimeValue(UI_FMT.decimal(percent, 1)),
    tone: toneForFloor(
      uptime.ratio,
      HEALTH_THRESHOLDS.uptimeRatio.warn,
      HEALTH_THRESHOLDS.uptimeRatio.error,
    ),
    hint: T.uptimeHint(UI_FMT.count(uptime.upMinutes), UI_FMT.count(uptime.observedMinutes)),
  };
}

export function buildP95Stat(metrics: ApiMetricsSnapshot): AdminHealthStat {
  const { latency } = metrics;
  if (!latency.available) return unavailableStat("p95", "platform", T.noDataYetHint);
  const hint = T.p95Hint(latency.windowMinutes, UI_FMT.count(latency.requests), UI_FMT.count(latency.errors5xx));
  if (latency.p95Ms === null) {
    return { key: "p95", section: "platform", valueText: T.p95NoTraffic, tone: "neutral", hint };
  }
  return {
    key: "p95",
    section: "platform",
    valueText: latency.saturated
      ? T.p95ValueAbove(UI_FMT.count(latency.p95Ms))
      : T.p95Value(UI_FMT.count(latency.p95Ms)),
    tone: toneForRange(
      latency.saturated ? Number.POSITIVE_INFINITY : latency.p95Ms,
      HEALTH_THRESHOLDS.p95Ms.warn,
      HEALTH_THRESHOLDS.p95Ms.error,
    ),
    hint,
  };
}

export function buildWorkerStat(liveness: WorkerLiveness | null): AdminHealthStat {
  if (liveness === null) return unavailableStat("worker", "queue", T.workerRedisUnavailableHint);
  if (liveness.state === "alive" && liveness.lastPingAgoMs !== null) {
    return {
      key: "worker",
      section: "queue",
      valueText: T.workerAlive(formatAgo(liveness.lastPingAgoMs)),
      tone: "ok",
      hint: T.workerHint,
    };
  }
  if (liveness.state === "stale" && liveness.lastPingAgoMs !== null) {
    return {
      key: "worker",
      section: "queue",
      valueText: T.workerStale(formatAgo(liveness.lastPingAgoMs)),
      tone: "error",
      hint: T.workerHint,
    };
  }
  return { key: "worker", section: "queue", valueText: T.workerUnknown, tone: "error", hint: T.workerHint };
}

/** ADMIN-HEALTH-02: доля ответов 5xx за окно гистограммы задержки. */
export function buildErrorRateStat(metrics: ApiMetricsSnapshot): AdminHealthStat {
  const { latency } = metrics;
  if (!latency.available) return unavailableStat("errorRate", "platform", T.noDataYetHint);
  const hint = T.errorRateHint(latency.windowMinutes, UI_FMT.count(latency.errors5xx), UI_FMT.count(latency.requests));
  if (latency.requests === 0) {
    return { key: "errorRate", section: "platform", valueText: T.p95NoTraffic, tone: "neutral", hint };
  }
  const percent = (latency.errors5xx / latency.requests) * 100;
  return {
    key: "errorRate",
    section: "platform",
    valueText: T.errorRateValue(UI_FMT.decimal(percent, 1)),
    tone: toneForRange(percent, HEALTH_THRESHOLDS.errorRatePercent.warn, HEALTH_THRESHOLDS.errorRatePercent.error),
    hint,
  };
}

export type TimedDependency = { state: DependencyState; ms: number };

export function buildDependencyStat(key: "database" | "redis", dep: TimedDependency): AdminHealthStat {
  if (dep.state === "disabled") {
    return { key, section: "platform", valueText: T.redisDisabled, tone: "warn", hint: T.dependencyHint };
  }
  if (dep.state === "down") {
    return {
      key,
      section: "platform",
      valueText: key === "database" ? T.dependencyDown : T.redisDown,
      tone: "error",
      hint: T.dependencyHint,
    };
  }
  return {
    key,
    section: "platform",
    valueText: T.dependencyOk(UI_FMT.count(dep.ms)),
    tone: toneForRange(dep.ms, HEALTH_THRESHOLDS.dependencyMs.warn, HEALTH_THRESHOLDS.dependencyMs.error),
    hint: T.dependencyHint,
  };
}

export function formatUptime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return T.uptimeMinutes(minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return T.uptimeHours(hours, minutes % 60);
  return T.uptimeDays(Math.floor(hours / 24), hours % 24);
}

export function buildProcessStat(uptimeSeconds: number, rssBytes: number): AdminHealthStat {
  return {
    key: "process",
    section: "platform",
    valueText: T.processValue(formatUptime(uptimeSeconds), UI_FMT.count(Math.round(rssBytes / (1024 * 1024)))),
    tone: "ok",
    hint: T.processHint,
  };
}

/** Суммарный расход платных вызовов ИИ за сутки и самый загруженный потолок. */
export function buildAiSpendStat(counts: Partial<Record<AiSpendMeter, number>>, aiEnabled: boolean): AdminHealthStat {
  if (!aiEnabled) return { key: "aiSpend", section: "integrations", valueText: T.aiSpendOff, tone: "neutral" };
  const meters = Object.keys(AI_SPEND_CEILINGS) as AiSpendMeter[];
  let used = 0;
  let limit = 0;
  let worst = 0;
  for (const meter of meters) {
    const count = counts[meter] ?? 0;
    used += count;
    limit += AI_SPEND_CEILINGS[meter];
    worst = Math.max(worst, count / AI_SPEND_CEILINGS[meter]);
  }
  return {
    key: "aiSpend",
    section: "integrations",
    valueText: T.aiSpendValue(UI_FMT.count(used), UI_FMT.count(limit)),
    tone: toneForRange(worst, HEALTH_THRESHOLDS.aiSpendRatio.warn, HEALTH_THRESHOLDS.aiSpendRatio.error),
    hint: T.aiSpendHint(
      meters.map((meter) => `${meter} ${UI_FMT.count(counts[meter] ?? 0)}/${UI_FMT.count(AI_SPEND_CEILINGS[meter])}`).join(", "),
    ),
  };
}

function configuredStat(
  key: "email" | "push" | "payments" | "smsBalance",
  configured: boolean,
): AdminHealthStat {
  return {
    key,
    section: "integrations",
    valueText: configured ? T.configured : T.notConfigured,
    // SMS — блокер запуска (без него нет входа по телефону), остальное — предупреждение.
    tone: configured ? "ok" : key === "smsBalance" ? "error" : "warn",
  };
}

async function timed(check: () => Promise<DependencyState>): Promise<TimedDependency> {
  const startedAt = Date.now();
  const state = await check();
  return { state, ms: Date.now() - startedAt };
}

async function readAiSpendToday(): Promise<Partial<Record<AiSpendMeter, number>>> {
  try {
    const rows = await prisma.aiSpendCounter.findMany({
      where: { dayKey: utcDayKey() },
      select: { meter: true, count: true },
    });
    return Object.fromEntries(rows.map((row) => [row.meter, row.count]));
  } catch {
    return {};
  }
}

export async function getAdminHealth(): Promise<AdminHealth> {
  // Reported reviews — count of `Review.reportedAt IS NOT NULL` among active
  // rows. Both moderation outcomes leave the count: «одобрить» clears
  // `reportedAt` (approve-review.service), «удалить» soft-deletes the row and
  // `ACTIVE_REVIEW_FILTER` drops it. So this IS the open moderation queue.
  // MOBILE-POLISH (App Store 1.2): плюс новые жалобы на контент (`ContentReport`
  // NEW) — та же очередь модерации, другой раздел («Жалобы»).
  const [queue, complaints, metrics, worker, database, redis, aiSpend, vk] = await Promise.all([
    getQueueStats(),
    Promise.all([
      prisma.review.count({
        where: { reportedAt: { not: null }, ...ACTIVE_REVIEW_FILTER },
      }),
      prisma.contentReport.count({ where: { status: "NEW" } }),
    ]).then(([reviews, contentReports]) => reviews + contentReports),
    readApiMetrics(),
    readWorkerLiveness(),
    timed(() => checkDatabase()),
    timed(() => checkRedis()),
    readAiSpendToday(),
    getVkCommunityAdminView().catch(() => null),
  ]);
  const notifier = getNotificationsNotifierRuntimeStatus();
  const memory = process.memoryUsage();

  const stats: AdminHealthStat[] = [
    // Платформа
    buildApiUptimeStat(metrics),
    buildP95Stat(metrics),
    buildErrorRateStat(metrics),
    buildDependencyStat("database", database),
    buildDependencyStat("redis", redis),
    buildProcessStat(process.uptime(), memory.rss),
    // Фоновые задачи
    buildWorkerStat(worker),
    {
      key: "queuePending",
      section: "queue",
      valueText:
        queue.pending < 0
          ? T.metricUnavailable
          : `${UI_FMT.count(queue.pending)} ${T.queuePendingSuffix}`,
      tone:
        queue.pending < 0
          ? "neutral"
          : toneForRange(
              queue.pending,
              HEALTH_THRESHOLDS.queuePending.warn,
              HEALTH_THRESHOLDS.queuePending.error,
            ),
      hint: queue.pending < 0 ? T.queueRedisUnavailableHint : T.queuePendingHint,
    },
    {
      key: "queueProcessing",
      section: "queue",
      valueText: queue.processing < 0 ? T.metricUnavailable : UI_FMT.count(queue.processing),
      tone:
        queue.processing < 0
          ? "neutral"
          : toneForRange(
              queue.processing,
              HEALTH_THRESHOLDS.queueProcessing.warn,
              HEALTH_THRESHOLDS.queueProcessing.error,
            ),
      hint: queue.processing < 0 ? T.queueRedisUnavailableHint : T.queueProcessingHint,
    },
    {
      key: "queueDead",
      section: "queue",
      valueText:
        queue.dead < 0 ? T.metricUnavailable : UI_FMT.count(queue.dead),
      tone:
        queue.dead < 0
          ? "neutral"
          : toneForRange(queue.dead, undefined, HEALTH_THRESHOLDS.queueDead.error),
      hint: queue.dead < 0 ? T.queueRedisUnavailableHint : undefined,
    },
    {
      key: "realtime",
      section: "queue",
      // Канал создаётся лениво, при первом подключении вкладки: «ещё не
      // запускался» в этом процессе — не авария.
      valueText: !notifier.ready
        ? notifier.reason === "not-initialized"
          ? T.realtimeIdle
          : T.realtimeDown
        : notifier.mode === "redis"
          ? T.realtimeReady
          : T.realtimeMemory,
      tone: !notifier.ready
        ? notifier.reason === "not-initialized"
          ? "neutral"
          : "error"
        : notifier.mode === "redis"
          ? "ok"
          : "warn",
      hint: T.realtimeHint,
    },
    // Интеграции
    configuredStat("email", isEmailConfigured),
    configuredStat("push", isPushEnabled),
    configuredStat("payments", isPaymentsEnabled),
    configuredStat("smsBalance", isSmsConfigured),
    {
      key: "vk",
      section: "integrations",
      valueText: vk?.mismatch ? T.vkMismatch : vk?.configured ? T.configured : T.notConfigured,
      tone: vk?.mismatch ? "error" : vk?.configured ? "ok" : "warn",
    },
    buildAiSpendStat(aiSpend, isAiFeaturesEnabled),
    // Модерация
    {
      key: "complaintsOpen",
      section: "moderation",
      valueText: UI_FMT.count(complaints),
      tone: toneForRange(
        complaints,
        HEALTH_THRESHOLDS.complaints.warn,
        HEALTH_THRESHOLDS.complaints.error,
      ),
    },
  ];

  return { stats, checkedAt: new Date().toISOString() };
}
