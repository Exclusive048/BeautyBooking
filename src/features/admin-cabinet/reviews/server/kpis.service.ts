import "server-only";

import { ReviewReportReason } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ACTIVE_REVIEW_FILTER } from "@/lib/reviews/soft-delete";
import type { AdminReviewsKpis } from "@/features/admin-cabinet/reviews/types";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Headline KPI tiles on `/admin/reviews`.
 *
 *   - pending reports + urgent subset (urgent = rating=1 OR
 *     reason=OFFENSIVE; matches `isUrgentReport` heuristic)
 *   - reviews-today count + delta vs 7-day rolling average
 *   - average rating across all reviews (rounded to 1 decimal)
 *   - deleted-last-week: count of soft-deletes (admin or author) in
 *     the trailing 7 days. Powered by `Review.deletedAt` after
 *     REVIEW-SOFT-DELETE-A — finally has a real value to show
 *
 * All "active reviews" tiles filter out soft-deleted rows via
 * `ACTIVE_REVIEW_FILTER`. The deleted-last-week tile is the one
 * exception — it intentionally queries the deleted set.
 */
export async function getAdminReviewsKpis(): Promise<AdminReviewsKpis> {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(todayStart.getTime() - 7 * DAY_MS);

  const [
    pendingTotal,
    pendingUrgent,
    todayCount,
    weekRows,
    ratingAgg,
    deletedLastWeekCount,
  ] = await Promise.all([
    prisma.review.count({
      where: { ...ACTIVE_REVIEW_FILTER, reportedAt: { not: null } },
    }),
    prisma.review.count({
      where: {
        ...ACTIVE_REVIEW_FILTER,
        reportedAt: { not: null },
        OR: [
          { rating: 1 },
          { reportReason: ReviewReportReason.OFFENSIVE },
        ],
      },
    }),
    prisma.review.count({
      where: { ...ACTIVE_REVIEW_FILTER, createdAt: { gte: todayStart } },
    }),
    prisma.review.findMany({
      where: {
        ...ACTIVE_REVIEW_FILTER,
        createdAt: { gte: sevenDaysAgo, lt: todayStart },
      },
      select: { createdAt: true },
    }),
    prisma.review.aggregate({
      where: ACTIVE_REVIEW_FILTER,
      _avg: { rating: true },
      _count: { _all: true },
    }),
    // Deliberately ignores ACTIVE_REVIEW_FILTER — this tile is the
    // one we want pointed at soft-deleted rows.
    prisma.review.count({
      where: { deletedAt: { gte: sevenDaysAgo } },
    }),
  ]);

  // 7-day average — bucket previous 7 days by UTC day, then mean of
  // the 7 buckets (some can be 0 — count those too so the average
  // reflects "even a low day still divides by 7").
  const dayCounts = new Map<string, number>();
  for (let i = 7; i > 0; i -= 1) {
    const d = new Date(todayStart.getTime() - i * DAY_MS);
    dayCounts.set(d.toISOString().slice(0, 10), 0);
  }
  for (const r of weekRows) {
    const key = r.createdAt.toISOString().slice(0, 10);
    if (dayCounts.has(key)) {
      dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1);
    }
  }
  const weekSum = Array.from(dayCounts.values()).reduce(
    (acc, v) => acc + v,
    0,
  );
  const weekAvg = weekSum / 7;
  let reviewsDelta: number | null = null;
  if (weekAvg > 0) {
    reviewsDelta = Math.round(((todayCount - weekAvg) / weekAvg) * 100);
  } else if (todayCount > 0) {
    // No history to compare against — but admin will want to see
    // there *is* activity. Use `null` so UI renders «—» rather than
    // a misleading +∞ figure.
    reviewsDelta = null;
  }

  const ratingValue =
    ratingAgg._count._all > 0 && ratingAgg._avg.rating !== null
      ? Math.round(ratingAgg._avg.rating * 10) / 10
      : null;

  return {
    pendingReports: { count: pendingTotal, urgentCount: pendingUrgent },
    reviewsToday: { count: todayCount, deltaPercentVsAvg: reviewsDelta },
    averageRating: {
      value: ratingValue,
      totalReviews: ratingAgg._count._all,
    },
    deletedLastWeek: {
      count: deletedLastWeekCount,
      // `totalReviews` denotes the size of the active pool so the UI
      // can show context ("X deleted out of N"). Reuse the same value
      // we already aggregated for `averageRating`.
      totalReviews: ratingAgg._count._all,
    },
  };
}
