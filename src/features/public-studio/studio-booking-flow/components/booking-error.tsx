"use client";

import { AlertCircle } from "lucide-react";
import * as UI_TEXT from "@/lib/ui/text";

type Props = {
  code: string | null;
  fallback?: string;
  /** Provider policy values used to expand {hours}/{days} placeholders. */
  minBookingHoursAhead?: number | null;
  maxBookingDaysAhead?: number | null;
};

/**
 * Per-error UI surface. The server returns typed `ErrorCode`s
 * (BOOKING-WIDGET-A added BOOKING_TOO_SOON / BOOKING_TOO_FAR /
 * NEW_CLIENTS_CLOSED). This component maps them to human copy with
 * inlined provider-policy numbers when available. Unknown codes fall
 * through to the `fallback` (server message) or the generic string.
 */
export function BookingError({
  code,
  fallback,
  minBookingHoursAhead,
  maxBookingDaysAhead,
}: Props) {
  if (!code && !fallback) return null;
  const message = resolveMessage(code, fallback, minBookingHoursAhead, maxBookingDaysAhead);
  return (
    <div className="flex items-start gap-2 rounded-xl border border-danger-border bg-danger-surface px-3 py-2.5 text-sm text-danger-text">
      <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
      <p className="leading-snug">{message}</p>
    </div>
  );
}

function resolveMessage(
  code: string | null,
  fallback: string | undefined,
  minHours: number | null | undefined,
  maxDays: number | null | undefined,
): string {
  // BOOKING-FLOW-AUDIT-RESIDUALS: без чисел политики — строка сервера. Она
  // несёт настоящее окно (`assertBookingWindow`), а прежний запасной «2 ч» /
  // «30 дней» был выдумкой: виджет студии чисел не передаёт вовсе.
  switch (code) {
    case "BOOKING_TOO_SOON":
      return minHours != null
        ? UI_TEXT.bookingWidget.errors.tooSoon.replace("{hours}", String(minHours))
        : fallback?.trim() || UI_TEXT.bookingWidget.errors.generic;
    case "BOOKING_TOO_FAR":
      return maxDays != null
        ? UI_TEXT.bookingWidget.errors.tooFar.replace("{days}", String(maxDays))
        : fallback?.trim() || UI_TEXT.bookingWidget.errors.generic;
    case "NEW_CLIENTS_CLOSED":
      return UI_TEXT.bookingWidget.errors.newClientsClosed;
    case "SLOT_CONFLICT":
    case "BOOKING_CONFLICT":
      return UI_TEXT.bookingWidget.errors.slotTaken;
    case "FORBIDDEN":
      return UI_TEXT.bookingWidget.errors.forbidden;
    default:
      return fallback?.trim() || UI_TEXT.bookingWidget.errors.generic;
  }
}
