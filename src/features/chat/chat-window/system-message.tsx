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
import { moneyRUB } from "@/lib/format";
import type {
  ChatPerspective,
  ThreadBookingCardDto,
  ThreadMessageDto,
} from "@/features/chat/types";

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
    ? "bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300"
    : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300";

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
  return (
    <Card className="w-full max-w-md overflow-hidden p-0">
      <div className="space-y-1.5 p-4 text-sm">
        <div className="font-semibold text-text-main">{card.serviceName}</div>

        {card.startAtUtc ? (
          <div className="flex items-center gap-1.5 text-text-sec">
            <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              {formatDate(card.startAtUtc, viewerTimezone)} ·{" "}
              {formatTime(card.startAtUtc, viewerTimezone)}
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
          {moneyRUB(card.priceSnapshot)}
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

function formatDate(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      timeZone: timezone,
      day: "numeric",
      month: "long",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatTime(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
