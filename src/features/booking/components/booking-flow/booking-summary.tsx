"use client";

import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";
import { UI_FMT } from "@/lib/ui/fmt";
import type { BookingFlowStep, BookingFlowSlot } from "@/features/booking/components/booking-flow/types";

const t = UI_TEXT.publicProfile.bookingFlow;
const tB = UI_TEXT.publicProfile.booking;

// A compact summary row: label → value
function SummaryRow({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="shrink-0 text-text-sec">{label}</span>
      <span
        className={cn(
          "text-right",
          muted ? "text-text-muted" : "font-medium text-text-main"
        )}
      >
        {value}
      </span>
    </div>
  );
}

type Props = {
  step: BookingFlowStep;
  serviceName: string;
  servicePrice: number;
  serviceDurationMin: number;
  selectedDateKey: string | null;
  selectedSlot: BookingFlowSlot | null;
  /** Desktop: full sidebar card. Mobile: compact sticky bar. */
  variant: "sidebar" | "sticky";
  className?: string;
};

function formatDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split("-");
  if (!year || !month || !day) return dateKey;
  return `${day}.${month}.${year}`;
}

export function BookingSummary({
  step,
  serviceName,
  servicePrice,
  serviceDurationMin,
  selectedDateKey,
  selectedSlot,
  variant,
  className,
}: Props) {
  const dateLabel = selectedDateKey ? formatDateKey(selectedDateKey) : null;
  const timeLabel = selectedSlot ? selectedSlot.timeText : null;
  const dateTimeLabel =
    dateLabel && timeLabel
      ? `${dateLabel}, ${timeLabel}`
      : dateLabel
        ? dateLabel
        : null;

  const priceStr =
    servicePrice > 0 ? UI_FMT.priceLabel(servicePrice) : tB.total;
  const durationStr = UI_FMT.durationLabel(serviceDurationMin);

  if (step === "success") return null;

  if (variant === "sticky") {
    // Mobile sticky bottom bar — compact
    return (
      <div
        className={cn(
          "flex items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-bg-card px-4 py-3 shadow-card",
          className
        )}
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text-main">{serviceName}</p>
          <p className="mt-0.5 text-xs text-text-sec">
            {dateTimeLabel ?? t.summarySelectDateTime}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-bold text-text-main">{priceStr}</p>
          <p className="text-xs text-text-sec">{durationStr}</p>
        </div>
      </div>
    );
  }

  // Desktop sidebar card
  return (
    <div
      className={cn(
        "lux-card rounded-[22px] p-4 space-y-3",
        className
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-text-sec">
        {tB.title}
      </p>

      <SummaryRow label={t.summaryService} value={serviceName} />
      <SummaryRow
        label={t.summaryDateTime}
        value={dateTimeLabel ?? t.summarySelectDateTime}
        muted={!dateTimeLabel}
      />

      <div className="h-px bg-border-subtle" />

      <div className="flex items-center justify-between text-sm">
        <span className="text-text-sec">{tB.total}</span>
        <span className="font-bold text-text-main">{priceStr}</span>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-sec">{tB.duration}</span>
        <span className="text-text-main">{durationStr}</span>
      </div>
    </div>
  );
}
