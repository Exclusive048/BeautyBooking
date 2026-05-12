import { Clock, Flame } from "lucide-react";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";
import type { BookingFlowSlot } from "@/features/booking/components/booking-flow/types";

type Props = {
  serviceName: string;
  servicePrice: number;
  serviceDurationMin: number;
  /** Selected slot — when present, the header shows hot-slot pricing. */
  slot: BookingFlowSlot | null;
};

const T = UI_TEXT.publicProfile.bookingWidget;

/**
 * Top strip of the booking widget — kept compact on purpose so the
 * date / time grids stay above-the-fold even in a sticky sidebar.
 */
export function ServiceHeader({
  serviceName,
  servicePrice,
  serviceDurationMin,
  slot,
}: Props) {
  const isHot =
    slot?.isHot &&
    typeof slot.discountedPrice === "number" &&
    typeof slot.originalPrice === "number" &&
    slot.discountedPrice < slot.originalPrice;

  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-text-sec">
        {T.headerEyebrow}
      </div>
      {isHot && slot ? (
        <div className="mt-1 flex items-baseline gap-2">
          <span className="font-display text-2xl text-text-main">
            {UI_FMT.priceLabel(slot.discountedPrice ?? servicePrice)}
          </span>
          <span className="text-sm text-text-sec line-through">
            {UI_FMT.priceLabel(slot.originalPrice ?? servicePrice)}
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-orange-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-orange-600 dark:text-orange-300">
            <Flame className="h-3 w-3" aria-hidden strokeWidth={1.8} />
            -{slot.discountPercent ?? slot.discountValue ?? 0}%
          </span>
        </div>
      ) : (
        <div className="mt-1 font-display text-2xl text-text-main">
          {servicePrice > 0
            ? UI_FMT.priceLabel(servicePrice)
            : UI_TEXT.publicProfile.services.priceOnRequest}
        </div>
      )}
      <div className="mt-1 inline-flex items-center gap-1.5 text-sm text-text-sec">
        <Clock className="h-3.5 w-3.5" aria-hidden strokeWidth={1.6} />
        <span>{UI_FMT.durationLabel(serviceDurationMin)}</span>
        <span aria-hidden className="text-text-sec/40">·</span>
        <span className="truncate">{serviceName}</span>
      </div>
    </div>
  );
}
