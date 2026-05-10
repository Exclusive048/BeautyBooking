import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";
import type { BookingFlowSlot } from "@/features/booking/components/booking-flow/types";

const T = UI_TEXT.publicProfile.bookingWidget;
const TF = UI_TEXT.publicProfile.bookingFlow;

type Props = {
  serviceName: string;
  servicePrice: number;
  serviceDurationMin: number;
  slot: BookingFlowSlot | null;
  dateKey: string | null;
  providerTimezone: string;
  compact?: boolean;
};

function formatDateLong(dateKey: string, timezone: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  const weekday = new Intl.DateTimeFormat("ru-RU", { weekday: "short", timeZone: timezone })
    .format(date)
    .replace(".", "");
  const day = date.getUTCDate();
  const month = TF.monthsGenitive[(m ?? 1) - 1] ?? "";
  return `${weekday} ${day} ${month}`;
}

function resolveEffectivePrice(slot: BookingFlowSlot | null, fallback: number): number {
  if (
    slot?.isHot &&
    typeof slot.discountedPrice === "number" &&
    slot.discountedPrice >= 0
  ) {
    return slot.discountedPrice;
  }
  return fallback;
}

/**
 * Closing summary card — used both inside the selection phase (full
 * variant with service line + date/time + total) and inside the form
 * phase (compact variant with just date/time + total to reinforce
 * what the user is about to confirm).
 */
export function SummaryBlock({
  serviceName,
  servicePrice,
  serviceDurationMin,
  slot,
  dateKey,
  providerTimezone,
  compact,
}: Props) {
  const effectivePrice = resolveEffectivePrice(slot, servicePrice);
  const slotTime = slot ? slot.label.slice(-5) : null;

  return (
    <div className="rounded-xl bg-bg-page p-3 text-sm">
      {!compact ? (
        <div className="flex items-center justify-between gap-3">
          <span className="truncate text-text-sec">{serviceName}</span>
          <span className="font-mono text-text-main">{UI_FMT.priceLabel(effectivePrice)}</span>
        </div>
      ) : null}

      <div className={compact ? "flex items-center justify-between gap-3" : "mt-1.5 flex items-center justify-between gap-3"}>
        <span className="text-text-sec">
          {dateKey ? formatDateLong(dateKey, providerTimezone) : T.summaryDateTimePending}
          {slotTime ? ` · ${slotTime}` : ""}
        </span>
        <span className="font-mono text-xs text-text-sec">
          {UI_FMT.durationLabel(serviceDurationMin)}
        </span>
      </div>

      <div className="mt-2 flex items-center justify-between gap-3 border-t border-border-subtle pt-2 text-[15px] font-semibold">
        <span>{T.summaryTotal}</span>
        <span className="font-mono">{UI_FMT.priceLabel(effectivePrice)}</span>
      </div>
    </div>
  );
}
