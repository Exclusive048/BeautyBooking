"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Calendar, CheckCircle2, Clock, Hourglass, MapPin, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { UI_FMT } from "@/lib/ui/fmt";
import * as UI_TEXT from "@/lib/ui/text";
import { formatZoneLabel, zonesDifferForViewer } from "@/lib/ui/zone-label";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";
import type { ConfirmedBooking } from "@/features/booking/components/booking-flow/types";
import { PENDING_EXPIRY_HOURS } from "@/lib/bookings/flow";
import {
  buildSuccessHeadline,
  isAwaitingConfirmation,
} from "@/features/booking/components/booking-flow/lib/success-headline";
import { GuestManageLinkCard } from "@/features/booking/components/guest-manage-link-card";

const T = UI_TEXT.publicProfile.bookingWidget;
const TF = UI_TEXT.publicProfile.bookingFlow;

type Props = {
  booking: ConfirmedBooking;
  onCancel: () => Promise<void> | void;
};

function formatLongDateTime(iso: string, timezone: string): string {
  const weekday = UI_FMT.date(iso, "weekdayShort", { timeZone: timezone }).replace(".", "");
  const dayMonth = UI_FMT.date(iso, "dayMonthLong", { timeZone: timezone });
  const hm = UI_FMT.timeShort(iso, { timeZone: timezone });
  return `${weekday}, ${dayMonth} · ${hm}`;
}

function formatRange(startIso: string, endIso: string | null, timezone: string): string {
  if (!endIso) return formatLongDateTime(startIso, timezone);
  const long = formatLongDateTime(startIso, timezone);
  const endTime = UI_FMT.timeShort(endIso, { timeZone: timezone });
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
  const pending = isAwaitingConfirmation(booking.status);
  const viewerTz = useViewerTimeZoneContext();
  // QA-107/FIX-22: the confirmed time is the salon's local time; show the
  // explicit zone label when the viewer's zone differs.
  const zoneLabel = zonesDifferForViewer({
    iso: booking.startAtUtc,
    salonTimeZone: booking.timezone,
    viewerTimeZone: viewerTz,
  })
    ? formatZoneLabel({ iso: booking.startAtUtc, timeZone: booking.timezone })
    : "";

  return (
    <div className="space-y-5 p-5">
      <div className="flex items-center gap-2">
        {pending ? (
          <Hourglass className="h-5 w-5 text-warning-text" aria-hidden strokeWidth={2} />
        ) : (
          <CheckCircle2 className="h-5 w-5 text-success-text" aria-hidden strokeWidth={2} />
        )}
        <p
          className={cn(
            "text-2xs font-medium uppercase tracking-wider",
            pending ? "text-warning-text" : "text-success-text",
          )}
        >
          {pending ? T.successPendingEyebrow : T.successEyebrow}
        </p>
      </div>

      <div className="space-y-1">
        <p className="font-display text-xl text-text-main">
          {buildSuccessHeadline(booking.providerName, booking.status)}
        </p>
        {pending ? (
          <p className="text-sm text-text-sec">{T.successPendingNote(PENDING_EXPIRY_HOURS)}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-text-main">
          <Calendar className="h-4 w-4 shrink-0 text-text-sec" aria-hidden strokeWidth={1.6} />
          <span>
            {formatRange(booking.startAtUtc, booking.endAtUtc, booking.timezone)}
            {/* FIX-EXP-CONTENT-GRAMMAR (EXP-004): a real space char (not just an
                `ml-1` margin) before the zone label — otherwise the range and
                «(Екатеринбург, GMT+5)» run together in text / screen-reader output. */}
            {zoneLabel ? (
              <>
                {" "}
                <span className="font-mono text-xs text-accent-text">{zoneLabel}</span>
              </>
            ) : null}
          </span>
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
          <p className="text-xs text-text-sec">{T.successPhoneLabel}</p>
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
            className="w-full text-text-sec hover:text-danger-text"
          >
            {cancelling ? TF.calendarLoading : T.successCancelAuth}
          </Button>
        ) : booking.manageUrl ? (
          <GuestManageLinkCard manageUrl={booking.manageUrl} />
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
