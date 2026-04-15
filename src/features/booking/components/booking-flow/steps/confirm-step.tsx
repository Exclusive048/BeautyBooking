"use client";

import { UI_TEXT } from "@/lib/ui/text";
import { UI_FMT } from "@/lib/ui/fmt";
import type { BookingFlowSlot } from "@/features/booking/components/booking-flow/types";

const t = UI_TEXT.publicProfile.bookingFlow;

type Props = {
  serviceName: string;
  servicePrice: number;
  selectedSlot: BookingFlowSlot;
  clientPhone: string;
  comment: string;
  silentMode: boolean;
  submitError: string | null;
};

function ConfirmRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <span className="shrink-0 text-text-sec">{label}</span>
      <span className="text-right font-medium text-text-main">{value}</span>
    </div>
  );
}

function formatDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split("-");
  if (!y || !m || !d) return dateKey;
  return `${d}.${m}.${y}`;
}

export function ConfirmStep({
  serviceName,
  servicePrice,
  selectedSlot,
  clientPhone,
  comment,
  silentMode,
  submitError,
}: Props) {
  const dateLabel = formatDateKey(selectedSlot.dayKey);
  const timeLabel = selectedSlot.timeText;
  const priceLabel = servicePrice > 0 ? UI_FMT.priceLabel(servicePrice) : UI_TEXT.publicProfile.services.priceOnRequest;

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-text-main">{t.confirmTitle}</p>

      <div className="divide-y divide-border-subtle rounded-2xl border border-border-subtle bg-bg-input/70 px-4">
        <ConfirmRow label={t.confirmService} value={serviceName} />
        <ConfirmRow label={t.confirmDateTime} value={`${dateLabel}, ${timeLabel}`} />
        <ConfirmRow label={UI_TEXT.publicProfile.booking.total} value={priceLabel} />
        {clientPhone && (
          <ConfirmRow label={t.confirmPhone} value={clientPhone} />
        )}
        {comment.trim() && (
          <ConfirmRow label={t.confirmComment} value={comment.trim()} />
        )}
        {silentMode && (
          <div className="py-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              🤫 {t.confirmSilentMode}
            </span>
          </div>
        )}
      </div>

      {submitError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {submitError}
        </p>
      )}
    </div>
  );
}
