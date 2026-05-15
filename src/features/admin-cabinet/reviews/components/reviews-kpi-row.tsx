import {
  ReviewsKpiCard,
  type ReviewsKpiTone,
} from "@/features/admin-cabinet/reviews/components/reviews-kpi-card";
import { UI_TEXT } from "@/lib/ui/text";
import type { AdminReviewsKpis } from "@/features/admin-cabinet/reviews/types";

const T = UI_TEXT.adminPanel.reviews.kpi;
const COUNT = new Intl.NumberFormat("ru-RU");

type Props = {
  data: AdminReviewsKpis;
};

function rateTone(value: number | null): ReviewsKpiTone {
  if (value === null) return "neutral";
  if (value >= 4.5) return "ok";
  if (value >= 3.5) return "warn";
  return "danger";
}

export function ReviewsKpiRow({ data }: Props) {
  const pendingTone: ReviewsKpiTone =
    data.pendingReports.count === 0
      ? "ok"
      : data.pendingReports.urgentCount > 0
        ? "danger"
        : "warn";

  const pendingSub =
    data.pendingReports.urgentCount > 0
      ? `${T.pendingUrgentSuffix} · ${data.pendingReports.urgentCount}`
      : null;

  const reviewsTodayTone: ReviewsKpiTone =
    data.reviewsToday.deltaPercentVsAvg === null
      ? "neutral"
      : data.reviewsToday.deltaPercentVsAvg >= 0
        ? "ok"
        : "warn";
  const reviewsTodaySub =
    data.reviewsToday.deltaPercentVsAvg === null
      ? null
      : `${data.reviewsToday.deltaPercentVsAvg > 0 ? "+" : ""}${data.reviewsToday.deltaPercentVsAvg}% ${T.reviewsTodayDelta}`;

  const ratingTone = rateTone(data.averageRating.value);
  const ratingValue =
    data.averageRating.value === null
      ? T.noData
      : data.averageRating.value.toFixed(1);

  const deletedValue =
    data.deletedLastWeek === null
      ? T.noData
      : COUNT.format(data.deletedLastWeek.count);
  const deletedSub =
    data.deletedLastWeek === null
      ? null
      : T.deletedLastWeekContext.replace(
          "{total}",
          COUNT.format(data.deletedLastWeek.totalReviews),
        );

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
      <ReviewsKpiCard
        label={T.pendingReports}
        value={COUNT.format(data.pendingReports.count)}
        sublabel={pendingSub}
        tone={pendingTone}
      />
      <ReviewsKpiCard
        label={T.reviewsToday}
        value={COUNT.format(data.reviewsToday.count)}
        sublabel={reviewsTodaySub}
        tone={reviewsTodayTone}
      />
      <ReviewsKpiCard
        label={T.averageRating}
        value={ratingValue}
        sublabel={T.averageRatingSubtitle}
        tone={ratingTone}
      />
      <ReviewsKpiCard
        label={T.deletedLastWeek}
        value={deletedValue}
        sublabel={deletedSub}
        tone="neutral"
      />
    </div>
  );
}
