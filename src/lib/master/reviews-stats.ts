import type { ReviewDto } from "@/lib/reviews/types";

/**
 * Pure, framework-free stats derived from a list of `ReviewDto`. Backs
 * the hero card, distribution chart, and KPI tiles on the master reviews
 * page (28a). Centralised here so the same numbers can power tests or
 * future analytics surfaces.
 */

export type ReviewDistribution = Record<1 | 2 | 3 | 4 | 5, number>;

export type ReviewStats = {
  totalCount: number;
  /** Two-decimal average rating across all reviews; 0 when empty. */
  avgRating: number;
  distribution: ReviewDistribution;
  /** Percentage of reviews that have a master reply, rounded. */
  responseRate: number;
  unansweredCount: number;
  /** Mean time-to-reply in milliseconds across answered reviews; null when
   * none have been answered yet. Part of the mobile JSON contract
   * (`GET /api/cabinet/master/reviews` → `stats`). */
  avgResponseMs: number | null;
  /** Reviews with photo attachments — always 0 in 28a (no schema yet);
   * kept in the shape so the UI tile renders consistently and the field
   * is ready to populate when photos ship. */
  withPhotosCount: number;
  /** Difference (current month avg − previous month avg). Null when
   * either month has fewer than 2 reviews — comparing thinly-sampled
   * months would be statistically misleading. */
  trendValue: number | null;
};

const TREND_MIN_REVIEWS_PER_MONTH = 2;

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfPrevMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() - 1, 1);
}

function clampRating(value: number): 1 | 2 | 3 | 4 | 5 {
  if (value <= 1) return 1;
  if (value >= 5) return 5;
  const rounded = Math.round(value);
  return Math.max(1, Math.min(5, rounded)) as 1 | 2 | 3 | 4 | 5;
}

export function computeReviewStats(reviews: ReviewDto[], now: Date = new Date()): ReviewStats {
  const totalCount = reviews.length;
  const distribution: ReviewDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  if (totalCount === 0) {
    return {
      totalCount: 0,
      avgRating: 0,
      distribution,
      responseRate: 0,
      unansweredCount: 0,
      avgResponseMs: null,
      withPhotosCount: 0,
      trendValue: null,
    };
  }

  let ratingSum = 0;
  let answeredCount = 0;
  let responseSum = 0;
  let responseSamples = 0;

  for (const review of reviews) {
    ratingSum += review.rating;
    distribution[clampRating(review.rating)] += 1;
    if (review.replyText) {
      answeredCount += 1;
      if (review.repliedAt) {
        const created = new Date(review.createdAt).getTime();
        const replied = new Date(review.repliedAt).getTime();
        if (Number.isFinite(created) && Number.isFinite(replied) && replied >= created) {
          responseSum += replied - created;
          responseSamples += 1;
        }
      }
    }
  }

  const avgRating = ratingSum / totalCount;
  const responseRate = Math.round((answeredCount / totalCount) * 100);
  const unansweredCount = totalCount - answeredCount;
  const avgResponseMs = responseSamples > 0 ? responseSum / responseSamples : null;

  // Trend: current vs previous month — null if either side is too thin.
  const monthStart = startOfMonth(now);
  const prevMonthStart = startOfPrevMonth(now);
  let currentSum = 0;
  let currentCount = 0;
  let prevSum = 0;
  let prevCount = 0;
  for (const review of reviews) {
    const created = new Date(review.createdAt);
    if (created >= monthStart) {
      currentSum += review.rating;
      currentCount += 1;
    } else if (created >= prevMonthStart) {
      prevSum += review.rating;
      prevCount += 1;
    }
  }
  const trendValue =
    currentCount >= TREND_MIN_REVIEWS_PER_MONTH && prevCount >= TREND_MIN_REVIEWS_PER_MONTH
      ? Number((currentSum / currentCount - prevSum / prevCount).toFixed(1))
      : null;

  return {
    totalCount,
    avgRating: Number(avgRating.toFixed(2)),
    distribution,
    responseRate,
    unansweredCount,
    avgResponseMs,
    withPhotosCount: 0,
    trendValue,
  };
}
