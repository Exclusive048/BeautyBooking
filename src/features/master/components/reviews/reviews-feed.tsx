import { Star } from "lucide-react";
import type { MasterReviewItem } from "@/lib/master/reviews-view.service";
import { UI_TEXT } from "@/lib/ui/text";
import { ReviewCard } from "./review-card";

const T = UI_TEXT.cabinetMaster.reviews.empty;

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
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-subtle bg-bg-card px-4 py-12 text-center">
        <Star className="mb-3 h-10 w-10 text-text-sec/40" aria-hidden />
        <p className="font-display text-base text-text-main">{T.title}</p>
        <p className="mt-1 max-w-md text-sm text-text-sec">
          {isFiltered ? T.bodyFiltered : T.bodyAll}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
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
