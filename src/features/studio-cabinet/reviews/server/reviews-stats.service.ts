import { prisma } from "@/lib/prisma";
import { ACTIVE_REVIEW_FILTER } from "@/lib/reviews/soft-delete";
import type {
  StudioReviewsStats,
  StudioReviewsStarBucket,
} from "../lib/types";

const TOP_SERVICES_LIMIT = 5;

/**
 * Aggregates studio review counters into the 3 dashboard cards: average
 * rating + distribution + top services by review count.
 *
 * Single query: pulls every non-deleted review with its rating + booking
 * service title. All numbers derived in-memory (small relative to
 * booking volume — studios typically see hundreds, not millions, of
 * reviews).
 *
 * Per spec, no rating delta — there's no `RatingSnapshot` model, the
 * same snapshot gap STUDIO-DASHBOARD-A flagged. Top services REPLACES
 * the reference's "топ/анти-топ мастера" stat (simpler + actionable).
 */
export async function loadStudioReviewsStats(studioId: string): Promise<StudioReviewsStats> {
  const reviews = await prisma.review.findMany({
    where: { ...ACTIVE_REVIEW_FILTER, studioId },
    select: {
      rating: true,
      booking: { select: { service: { select: { name: true, title: true } } } },
    },
  });

  const total = reviews.length;
  if (total === 0) {
    return {
      averageRating: 0,
      totalReviews: 0,
      positivePercent: 0,
      distribution: buildEmptyDistribution(),
      topServicesByReviews: [],
    };
  }

  const sumRating = reviews.reduce((sum, r) => sum + r.rating, 0);
  const averageRating = Math.round((sumRating / total) * 100) / 100;
  const positiveCount = reviews.filter((r) => r.rating >= 4).length;
  const positivePercent = Math.round((positiveCount / total) * 100);

  // Distribution buckets
  const bucketCounts = new Map<number, number>();
  for (const r of reviews) {
    bucketCounts.set(r.rating, (bucketCounts.get(r.rating) ?? 0) + 1);
  }
  const distribution: StudioReviewsStarBucket[] = ([5, 4, 3, 2, 1] as const).map((stars) => {
    const count = bucketCounts.get(stars) ?? 0;
    return {
      stars,
      count,
      percent: total > 0 ? Math.round((count / total) * 100) : 0,
    };
  });

  // Top services by review count
  const serviceCounts = new Map<string, number>();
  for (const r of reviews) {
    const name = r.booking?.service?.title?.trim() || r.booking?.service?.name?.trim();
    if (!name) continue;
    serviceCounts.set(name, (serviceCounts.get(name) ?? 0) + 1);
  }
  const topServicesByReviews = Array.from(serviceCounts.entries())
    .map(([serviceName, reviewCount]) => ({ serviceName, reviewCount }))
    .sort((a, b) => b.reviewCount - a.reviewCount)
    .slice(0, TOP_SERVICES_LIMIT);

  return {
    averageRating,
    totalReviews: total,
    positivePercent,
    distribution,
    topServicesByReviews,
  };
}

function buildEmptyDistribution(): StudioReviewsStarBucket[] {
  return ([5, 4, 3, 2, 1] as const).map((stars) => ({ stars, count: 0, percent: 0 }));
}
