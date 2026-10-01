import * as UI_TEXT from "@/lib/ui/text";
import { RatingStars } from "./rating-stars";

const T = UI_TEXT.studioCabinet.reviewsV2.stats;

type Props = {
  averageRating: number;
  totalReviews: number;
  positivePercent: number;
};

/**
 * Rating summary card. Per spec — no «+0.12 за месяц» delta. The
 * underlying snapshot model doesn't exist (same gap STUDIO-DASHBOARD-A
 * called out for occupancy/rating deltas). Showing a fake delta would
 * mislead studio owners about month-over-month trends.
 */
export function RatingSummaryCard({ averageRating, totalReviews, positivePercent }: Props) {
  const value = averageRating.toFixed(2);
  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-card p-4">
      <p className="eyebrow">
        {T.avgTitle}
      </p>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-display text-3xl font-bold text-text-main">{value}</span>
        <span className="text-sm text-text-sec">/ 5.0</span>
      </div>
      <div className="mt-2">
        <RatingStars value={averageRating} size="md" />
      </div>
      <p className="mt-2 text-[12px] text-text-sec">
        {T.avgBasis
          .replace("{count}", String(totalReviews))
          .replace("{percent}", String(positivePercent))}
      </p>
    </div>
  );
}
