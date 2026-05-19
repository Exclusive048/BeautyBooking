"use client";

import { AlertCircle } from "lucide-react";
import { UI_TEXT } from "@/lib/ui/text";

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
    <div className="flex items-start gap-2 rounded-xl border border-red-200/60 bg-red-50/80 px-3 py-2.5 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
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
  switch (code) {
    case "BOOKING_TOO_SOON":
      return UI_TEXT.bookingWidget.errors.tooSoon.replace("{hours}", String(minHours ?? 2));
    case "BOOKING_TOO_FAR":
      return UI_TEXT.bookingWidget.errors.tooFar.replace("{days}", String(maxDays ?? 30));
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
