import "server-only";

import { prisma } from "@/lib/prisma";
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

function unavailableStat(key: AdminHealthStat["key"], hint: string = T.metricUnavailableHint): AdminHealthStat {
  return { key, valueText: T.metricUnavailable, tone: "neutral", hint };
}

export function buildApiUptimeStat(metrics: ApiMetricsSnapshot): AdminHealthStat {
  const { uptime } = metrics;
  if (!uptime.available || uptime.ratio === null) {
    return unavailableStat("apiUptime", T.noDataYetHint);
  }
  const percent = uptime.ratio * 100;
  return {
    key: "apiUptime",
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
  if (!latency.available) return unavailableStat("p95", T.noDataYetHint);
  const hint = T.p95Hint(latency.windowMinutes, UI_FMT.count(latency.requests), UI_FMT.count(latency.errors5xx));
  if (latency.p95Ms === null) {
    return { key: "p95", valueText: T.p95NoTraffic, tone: "neutral", hint };
  }
  return {
    key: "p95",
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
  if (liveness === null) return unavailableStat("worker", T.workerRedisUnavailableHint);
  if (liveness.state === "alive" && liveness.lastPingAgoMs !== null) {
    return {
      key: "worker",
      valueText: T.workerAlive(formatAgo(liveness.lastPingAgoMs)),
      tone: "ok",
      hint: T.workerHint,
    };
  }
  if (liveness.state === "stale" && liveness.lastPingAgoMs !== null) {
    return {
      key: "worker",
      valueText: T.workerStale(formatAgo(liveness.lastPingAgoMs)),
      tone: "error",
      hint: T.workerHint,
    };
  }
  return { key: "worker", valueText: T.workerUnknown, tone: "error", hint: T.workerHint };
}

export async function getAdminHealth(): Promise<AdminHealth> {
  // Reported reviews — count of `Review.reportedAt IS NOT NULL` among active
  // rows. Both moderation outcomes leave the count: «одобрить» clears
  // `reportedAt` (approve-review.service), «удалить» soft-deletes the row and
  // `ACTIVE_REVIEW_FILTER` drops it. So this IS the open moderation queue.
  const [queue, complaints, metrics, worker] = await Promise.all([
    getQueueStats(),
    prisma.review.count({
      where: { reportedAt: { not: null }, ...ACTIVE_REVIEW_FILTER },
    }),
    readApiMetrics(),
    readWorkerLiveness(),
  ]);

  const stats: AdminHealthStat[] = [
    buildApiUptimeStat(metrics),
    buildP95Stat(metrics),
    buildWorkerStat(worker),
    {
      key: "queuePending",
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
      key: "queueDead",
      valueText:
        queue.dead < 0 ? T.metricUnavailable : UI_FMT.count(queue.dead),
      tone:
        queue.dead < 0
          ? "neutral"
          : toneForRange(queue.dead, undefined, HEALTH_THRESHOLDS.queueDead.error),
      hint: queue.dead < 0 ? T.queueRedisUnavailableHint : undefined,
    },
    {
      key: "complaintsOpen",
      valueText: UI_FMT.count(complaints),
      tone: toneForRange(
        complaints,
        HEALTH_THRESHOLDS.complaints.warn,
        HEALTH_THRESHOLDS.complaints.error,
      ),
    },
    // SMS gateway isn't wired in yet (P1 from the project audit). Show
    // "Не настроен" with a red dot so it stays visible as a launch
    // blocker every time an admin opens the dashboard.
    {
      key: "smsBalance",
      valueText: T.smsNotConfigured,
      tone: "error",
    },
  ];

  return { stats };
}
