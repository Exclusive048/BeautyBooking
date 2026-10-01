"use client";

import Link from "next/link";
import {
  Calendar,
  CheckCircle,
  Clock,
  MapPin,
  XCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { moneyRUBFromKopeks } from "@/lib/format";
import { formatLocalHm } from "@/lib/schedule/timezone";
import { formatZoneLabel, zonesDifferForViewer } from "@/lib/ui/zone-label";
import * as UI_TEXT from "@/lib/ui/text";
import type {
  ChatPerspective,
  ThreadBookingCardDto,
  ThreadMessageDto,
} from "@/features/chat/types";
import { UI_FMT } from "@/lib/ui/fmt";

const T = UI_TEXT.chat.card;

type Props = {
  message: ThreadMessageDto;
  perspective: ChatPerspective;
  viewerTimezone: string;
};

const CANCELLED_STATUSES = new Set(["CANCELLED", "REJECTED", "NO_SHOW"]);

/**
 * Renders a SYSTEM message — centered pill with optional booking card.
 * Used for lifecycle events (created/confirmed/rescheduled/cancelled) emitted
 * by `src/lib/chat/system-messages.ts`. The pill color is event-aware: green
 * for confirmed/created, slate for cancelled. If the message has a pinned
 * `bookingCard`, the card renders below the pill with status + quick links.
 */
export function SystemMessage({ message, perspective, viewerTimezone }: Props) {
  const card = message.bookingCard;
  const isCancelled = card ? CANCELLED_STATUSES.has(card.status) : false;
  const PillIcon = isCancelled ? XCircle : CheckCircle;

  const pillClasses = isCancelled
    ? "bg-muted text-muted-foreground"
    : "bg-success-surface text-success-text";

  return (
    <div className="my-2 flex flex-col items-center gap-2">
      <div
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ${pillClasses}`}
      >
        <PillIcon className="h-3 w-3" aria-hidden />
        <span>{message.body}</span>
      </div>

      {card ? (
        <BookingCard
          card={card}
          perspective={perspective}
          viewerTimezone={viewerTimezone}
        />
      ) : null}
    </div>
  );
}

function BookingCard({
  card,
  perspective,
  viewerTimezone,
}: {
  card: ThreadBookingCardDto;
  perspective: ChatPerspective;
  viewerTimezone: string;
}) {
  const detailHref =
    perspective === "client"
      ? `/cabinet/bookings#${card.id}`
      : `/cabinet/master/bookings#${card.id}`;

  // FIX-TZ-SYSTEM-MESSAGE (tz-source: salon-tz): this card is bilateral — a
  // client of an out-of-zone salon must read the salon's wall clock, not their
  // own browser tz. Render the appointment time in salon-tz via the sanctioned
  // `formatLocalHm`; keep `viewerTimezone` only to decide whether to append the
  // explicit zone label (shown when the viewer's zone differs). Mirrors the
  // reference surface client-bookings-page.tsx (QA-107/FIX-22). Message
  // timestamps elsewhere in the thread stay deliberately viewer-tz.
  const salonTz = card.timezone;
  const showZone =
    !!card.startAtUtc &&
    zonesDifferForViewer({
      iso: card.startAtUtc,
      salonTimeZone: salonTz,
      viewerTimeZone: viewerTimezone,
    });
  const zoneLabel = showZone
    ? formatZoneLabel({ iso: card.startAtUtc, timeZone: salonTz })
    : "";

  return (
    <Card className="w-full max-w-md overflow-hidden p-0">
      <div className="space-y-1.5 p-4 text-sm">
        <div className="font-semibold text-text-main">{card.serviceName}</div>

        {card.startAtUtc ? (
          <div className="flex items-center gap-1.5 text-text-sec">
            <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              {formatDate(card.startAtUtc, salonTz)} ·{" "}
              {formatLocalHm(new Date(card.startAtUtc), salonTz)}
            </span>
          </div>
        ) : null}

        {zoneLabel ? (
          <div className="flex items-center gap-1 text-xs font-medium text-accent-text">
            <span>
              {T.salonTimeNote} {zoneLabel}
            </span>
          </div>
        ) : null}

        <div className="flex items-center gap-1.5 text-text-sec">
          <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{card.durationMin} мин</span>
        </div>

        {card.address ? (
          <div className="flex items-center gap-1.5 text-text-sec">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">{card.address}</span>
          </div>
        ) : null}

        <div className="pt-1 font-mono text-base font-semibold text-text-main">
          {moneyRUBFromKopeks(card.priceSnapshot)}
        </div>

        <div className="pt-2">
          <Link
            href={detailHref}
            className="inline-flex items-center gap-1 rounded-lg border border-border-subtle bg-bg-input px-2.5 py-1.5 text-xs font-medium text-text-main transition hover:border-primary/40 hover:bg-bg-card"
          >
            Открыть запись
          </Link>
        </div>
      </div>
    </Card>
  );
}

// Date part (day + month) rendered in the salon's tz — the caller passes
// `card.timezone`, never the viewer's. The appointment TIME is formatted
// separately via `formatLocalHm` (sanctioned salon-tz helper).
function formatDate(iso: string, timezone: string): string {
  return UI_FMT.date(iso, "dayMonthLong", { timeZone: timezone });
}
