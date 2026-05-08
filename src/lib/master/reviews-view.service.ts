import { listReviews } from "@/lib/reviews/service";
import type { ReviewDto } from "@/lib/reviews/types";
import {
  computeReviewStats,
  formatResponseDuration,
  type ReviewStats,
} from "@/lib/master/reviews-stats";

/**
 * Server aggregator for `/cabinet/master/reviews` (28a).
 *
 * Reuses `listReviews` (which already enforces visibility rules and
 * exposes `privateTags` to the master) to fetch the entire feed for a
 * provider, then computes stats in-memory and applies the active filter.
 * Pagination is not surfaced in 28a — masters typically have low review
 * counts, and seeing the full list is the common use case.
 *
 * `?filter=` is URL-driven (Все / Без ответа / 4-5★ / 1-3★). Filter
 * counts come from the same in-memory list so the chip badges always
 * line up with what the user will see after switching.
 */

export type ReviewsFilterId = "all" | "unanswered" | "good" | "bad";

const VALID_FILTERS: ReadonlySet<ReviewsFilterId> = new Set([
  "all",
  "unanswered",
  "good",
  "bad",
]);

export function parseFilter(value: string | null | undefined): ReviewsFilterId {
  return value && VALID_FILTERS.has(value as ReviewsFilterId)
    ? (value as ReviewsFilterId)
    : "all";
}

export type MasterReviewsViewData = {
  stats: ReviewStats;
  /** Mean response time formatted for the KPI tile, or null when none
   * answered yet. Rendered as em-dash by the UI when null. */
  avgResponseLabel: string | null;
  filterCounts: Record<ReviewsFilterId, number>;
  activeFilter: ReviewsFilterId;
  /** The filtered + sorted list, newest first. Each item is a ready-to-render
   * `ReviewDto` augmented with the `isNew` flag (recent + unanswered). */
  reviews: MasterReviewItem[];
};

export type MasterReviewItem = ReviewDto & {
  /** True when the review was created within the last 7 days and has no
   * reply yet — surfaces the "NEW" badge in the card meta. */
  isNew: boolean;
};

const NEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function applyFilter(reviews: ReviewDto[], filter: ReviewsFilterId): ReviewDto[] {
  if (filter === "all") return reviews;
  if (filter === "unanswered") return reviews.filter((r) => !r.replyText);
  if (filter === "good") return reviews.filter((r) => r.rating >= 4);
  return reviews.filter((r) => r.rating <= 3);
}

function decorate(reviews: ReviewDto[], now: Date): MasterReviewItem[] {
  const cutoff = now.getTime() - NEW_WINDOW_MS;
  return reviews.map((review) => ({
    ...review,
    isNew: !review.replyText && new Date(review.createdAt).getTime() >= cutoff,
  }));
}

export async function getMasterReviewsView(input: {
  masterProviderId: string;
  currentUserId: string;
  currentUserRoles: import("@prisma/client").AccountType[];
  filter: ReviewsFilterId;
  now?: Date;
}): Promise<MasterReviewsViewData> {
  const now = input.now ?? new Date();

  const reviews = await listReviews({
    targetType: "provider",
    targetId: input.masterProviderId,
    limit: 100,
    offset: 0,
    currentUser: { id: input.currentUserId, roles: input.currentUserRoles },
  });

  const stats = computeReviewStats(reviews, now);

  const filterCounts: Record<ReviewsFilterId, number> = {
    all: reviews.length,
    unanswered: reviews.filter((r) => !r.replyText).length,
    good: reviews.filter((r) => r.rating >= 4).length,
    bad: reviews.filter((r) => r.rating <= 3).length,
  };

  const filtered = applyFilter(reviews, input.filter);
  // Newest first — `listReviews` already orders by createdAt desc (default
  // through the underlying findMany), but a defensive sort here keeps the
  // contract explicit and survives any upstream re-ordering.
  filtered.sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );

  return {
    stats,
    avgResponseLabel: formatResponseDuration(stats.avgResponseMs),
    filterCounts,
    activeFilter: input.filter,
    reviews: decorate(filtered, now),
  };
}
