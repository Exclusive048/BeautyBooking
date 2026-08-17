import { Star } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import type { MasterReviewItem } from "@/lib/master/reviews-view.service";
import { UI_TEXT } from "@/lib/ui/text";
import { ReviewCard } from "./review-card";

const T = UI_TEXT.cabinetMaster.reviews.empty;
/** Сброс фильтра = тот же путь без query-параметров. */
const PAGE_PATH = "/cabinet/master/reviews";

type Props = {
  reviews: MasterReviewItem[];
  /** Map of bookingId → service title; populated by the server orchestrator
   * since `ReviewDto` doesn't carry the service name. Booking-less reviews
   * fall back to a generic "Услуга" label. */
  serviceByBookingId: Map<string, string>;
  masterName: string;
  masterSeed: string;
  /** True when filters/search would have produced more results — affects
   * empty-state copy. */
  isFiltered: boolean;
  now: Date;
};

/**
 * Feed wrapper: empty state when nothing matches, otherwise a stacked
 * list of cards. The server orchestrator injects the service-name map
 * so each card can show `Manicure + gel polish` next to the date —
 * without forcing the underlying `ReviewDto` to grow that field.
 */
export function ReviewsFeed({
  reviews,
  serviceByBookingId,
  masterName,
  masterSeed,
  isFiltered,
  now,
}: Props) {
  if (reviews.length === 0) {
    // RES-28: общий примитив. Действие — только у отфильтрованного случая
    // (фильтр в query-строке, сброс = путь без параметров). Отзыв пишет клиент,
    // поэтому кнопки для случая «отзывов ещё нет» у мастера быть не может.
    return (
      <EmptyState
        variant="card"
        icon={Star}
        title={T.title}
        description={isFiltered ? T.bodyFiltered : T.bodyAll}
        action={isFiltered ? { label: T.resetCta, href: PAGE_PATH } : undefined}
      />
    );
  }

  return (
    <div className="space-y-3" data-testid="reviews-list">
      {reviews.map((review) => (
        <ReviewCard
          key={review.id}
          review={review}
          masterName={masterName}
          masterSeed={masterSeed}
          serviceName={
            review.bookingId ? serviceByBookingId.get(review.bookingId) ?? null : null
          }
          now={now}
        />
      ))}
    </div>
  );
}
