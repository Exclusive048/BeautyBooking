"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Calendar, CheckCircle2, Clock, MapPin, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";
import type { ConfirmedBooking } from "@/features/booking/components/booking-flow/types";

const T = UI_TEXT.publicProfile.bookingWidget;
const TF = UI_TEXT.publicProfile.bookingFlow;

type Props = {
  booking: ConfirmedBooking;
  onCancel: () => Promise<void> | void;
};

function formatLongDateTime(iso: string, timezone: string): string {
  const date = new Date(iso);
  const weekday = new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    timeZone: timezone,
  })
    .format(date)
    .replace(".", "");
  const dayMonth = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    timeZone: timezone,
  }).format(date);
  const hm = new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  }).format(date);
  return `${weekday}, ${dayMonth} · ${hm}`;
}

function formatRange(startIso: string, endIso: string | null, timezone: string): string {
  if (!endIso) return formatLongDateTime(startIso, timezone);
  const long = formatLongDateTime(startIso, timezone);
  const endTime = new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  }).format(new Date(endIso));
  return `${long} — ${endTime}`;
}

/**
 * Phase 3 — the confirmation card. Two cancel UX variants:
 *   - authenticated user → live cancel button (server hits the
 *     existing /api/bookings/[id]/cancel route they already own)
 *   - guest → "log in to cancel" hint linking to /login with a
 *     return URL; guest cancellation is BACKLOG (see brief).
 */
export function SuccessPhase({ booking, onCancel }: Props) {
  const [cancelling, setCancelling] = useState(false);

  return (
    <div className="space-y-5 p-5">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-5 w-5 text-emerald-500" aria-hidden strokeWidth={2} />
        <p className="text-[11px] font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
          {T.successEyebrow}
        </p>
      </div>

      <p className="font-display text-xl text-text-main">
        {T.successHeadlineTemplate.replace("{name}", booking.providerName)}
      </p>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-text-main">
          <Calendar className="h-4 w-4 shrink-0 text-text-sec" aria-hidden strokeWidth={1.6} />
          <span>{formatRange(booking.startAtUtc, booking.endAtUtc, booking.timezone)}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-text-main">
          <Clock className="h-4 w-4 shrink-0 text-text-sec" aria-hidden strokeWidth={1.6} />
          <span>{booking.serviceName}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-text-main">
          <Receipt className="h-4 w-4 shrink-0 text-text-sec" aria-hidden strokeWidth={1.6} />
          <span className="font-mono">{UI_FMT.priceLabel(booking.servicePrice)}</span>
        </div>
        {booking.providerAddress ? (
          <div className="flex items-start gap-2 text-sm text-text-main">
            <MapPin
              className="mt-0.5 h-4 w-4 shrink-0 text-text-sec"
              aria-hidden
              strokeWidth={1.6}
            />
            <span>{booking.providerAddress}</span>
          </div>
        ) : null}
      </div>

      {booking.clientPhoneMasked ? (
        <div className="rounded-xl bg-bg-page p-3">
          <p className="text-xs text-text-sec">{T.successConfirmationSentTo}</p>
          <p className="mt-0.5 font-mono text-sm text-text-main">
            {booking.clientPhoneMasked}
          </p>
        </div>
      ) : null}

      <div className="space-y-2">
        <Button size="lg" asChild className="w-full gap-1.5">
          <Link href="/cabinet">
            {T.successGoToCabinet}
            <ArrowRight className="h-4 w-4" aria-hidden strokeWidth={1.8} />
          </Link>
        </Button>

        {booking.isAuthenticatedUser ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={cancelling}
            onClick={async () => {
              setCancelling(true);
              try {
                await onCancel();
              } finally {
                setCancelling(false);
              }
            }}
            className="w-full text-text-sec hover:text-rose-600"
          >
            {cancelling ? TF.calendarLoading : T.successCancelAuth}
          </Button>
        ) : (
          <Link
            href="/login"
            className="block w-full text-center text-xs text-text-sec underline-offset-2 transition hover:text-text-main hover:underline"
          >
            {T.successCancelGuest}
          </Link>
        )}
      </div>
    </div>
  );
}
