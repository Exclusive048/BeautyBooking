import type {
  StudioReviewFilter,
  StudioReviewsListData,
  StudioReviewsStats,
} from "../lib/types";
import { ReviewsFilters } from "./reviews-filters";
import { ReviewsHeader } from "./reviews-header";
import { ReviewsList } from "./reviews-list";
import { ReviewsPagination } from "./reviews-pagination";
import { ReviewsStatsRow } from "./reviews-stats-row";

type Props = {
  data: StudioReviewsListData;
  stats: StudioReviewsStats;
  filter: StudioReviewFilter;
  masterId: string;
};

/**
 * Server orchestrator for `/cabinet/studio/reviews`. Lays out header →
 * 3-up stats row → filters → list → pagination.
 */
export function StudioReviewsPage({ data, stats, filter, masterId }: Props) {
  return (
    <div className="space-y-5 lg:space-y-6">
      <ReviewsHeader
        totalReviews={data.totalReviewsCount}
        unansweredCount={data.unansweredCount}
      />
      <ReviewsStatsRow stats={stats} />
      <ReviewsFilters
        filter={filter}
        masterId={masterId}
        masters={data.masterOptions}
        counts={data.filterCounts}
      />
      <ReviewsList reviews={data.items} />
      <ReviewsPagination nextCursor={data.nextCursor} />
    </div>
  );
}
