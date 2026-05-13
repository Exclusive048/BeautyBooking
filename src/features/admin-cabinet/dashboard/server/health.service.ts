import "server-only";

import { prisma } from "@/lib/prisma";
import { getQueueStats } from "@/lib/queue/queue";
import { ACTIVE_REVIEW_FILTER } from "@/lib/reviews/soft-delete";
import { UI_TEXT } from "@/lib/ui/text";
import { formatCount } from "@/features/admin-cabinet/dashboard/server/shared";
import type {
  AdminHealth,
  AdminHealthStat,
  AdminHealthTone,
} from "@/features/admin-cabinet/dashboard/types";

const T = UI_TEXT.adminPanel.dashboard.health;

/** Thresholds picked to match the reference's "ok / not ok" pacing —
 * tuned to be lenient enough that a healthy environment shows green
 * across the board. */
const THRESHOLDS = {
  queuePending: { warn: 100, error: 500 },
  queueDead: { error: 1 }, // any dead job is a problem
  complaints: { warn: 1, error: 6 },
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

export async function getAdminHealth(): Promise<AdminHealth> {
  // Reported reviews — count of `Review.reportedAt IS NOT NULL`. There's
  // no schema field tracking "moderation resolved", so this is a strict
  // upper bound on the actual queue. Documented as a known limitation.
  const [queue, complaints] = await Promise.all([
    getQueueStats(),
    prisma.review.count({
      where: { reportedAt: { not: null }, ...ACTIVE_REVIEW_FILTER },
    }),
  ]);

  const stats: AdminHealthStat[] = [
    // API uptime: no APM integration yet. Render "—" with a neutral dot
    // and a tooltip explaining why — never lie about uptime to admins.
    {
      key: "apiUptime",
      valueText: T.metricUnavailable,
      tone: "neutral",
      hint: T.metricUnavailableHint,
    },
    {
      key: "p95",
      valueText: T.metricUnavailable,
      tone: "neutral",
      hint: T.metricUnavailableHint,
    },
    {
      key: "queuePending",
      valueText:
        queue.pending < 0
          ? T.metricUnavailable
          : `${formatCount(queue.pending)} ${T.queuePendingSuffix}`,
      tone:
        queue.pending < 0
          ? "neutral"
          : toneForRange(
              queue.pending,
              THRESHOLDS.queuePending.warn,
              THRESHOLDS.queuePending.error,
            ),
    },
    {
      key: "queueDead",
      valueText:
        queue.dead < 0 ? T.metricUnavailable : formatCount(queue.dead),
      tone:
        queue.dead < 0
          ? "neutral"
          : toneForRange(queue.dead, undefined, THRESHOLDS.queueDead.error),
    },
    {
      key: "complaintsOpen",
      valueText: formatCount(complaints),
      tone: toneForRange(
        complaints,
        THRESHOLDS.complaints.warn,
        THRESHOLDS.complaints.error,
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
