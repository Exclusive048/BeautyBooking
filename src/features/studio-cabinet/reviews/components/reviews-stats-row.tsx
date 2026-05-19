import type { StudioReviewsStats } from "../lib/types";
import { RatingDistributionCard } from "./rating-distribution-card";
import { RatingSummaryCard } from "./rating-summary-card";
import { TopServicesCard } from "./top-services-card";

type Props = {
  stats: StudioReviewsStats;
};

/** 3-up row: average rating + distribution + top services by reviews. */
export function ReviewsStatsRow({ stats }: Props) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <RatingSummaryCard
        averageRating={stats.averageRating}
        totalReviews={stats.totalReviews}
        positivePercent={stats.positivePercent}
      />
      <RatingDistributionCard distribution={stats.distribution} />
      <TopServicesCard services={stats.topServicesByReviews} />
    </div>
  );
}
