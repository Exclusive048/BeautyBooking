"use client";

import { useState } from "react";
import { MoreHorizontal, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ResilientImage } from "@/components/ui/resilient-image";
import {
  JOURNAL_STATUS_TONE,
  isJournalStatusInactive,
  type JournalStatusKey,
} from "@/features/bookings-journal/lib/journal-status";
import { BookingActionMenu } from "@/features/studio-cabinet/schedule/components/dialogs/booking-action-menu";
import { studioCellActions, studioCellHasActions } from "@/features/studio-cabinet/schedule/lib/cell-actions";
import type { ScheduleMasterColumn } from "@/features/studio-cabinet/schedule/server/types";
import { cn } from "@/lib/cn";
import { formatLocalHm } from "@/lib/schedule/timezone";
import { UI_FMT } from "@/lib/ui/fmt";
import * as UI_TEXT from "@/lib/ui/text";
import { bookingToCell } from "../lib/booking-to-cell";
import { SOURCE_BADGE_CLASS, getBookingSourceDisplay } from "../lib/source-display";
import type { StudioBookingRow } from "../server/types";

const T = UI_TEXT.studioCabinet.bookingsV2;
const J = UI_TEXT.schedule.bookingsJournal;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : "";
  return (first + last).toUpperCase() || "•";
}

function hm(iso: string, timeZone: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : formatLocalHm(date, timeZone);
}

function durationMinutes(row: StudioBookingRow): number {
  const ms = new Date(row.endAtUtc).getTime() - new Date(row.startAtUtc).getTime();
  if (Number.isFinite(ms) && ms > 0) return Math.round(ms / 60000);
  return row.service.durationMin;
}

/**
 * BOOKINGS-JOURNAL — запись в журнале студии: время (salon-tz), клиент и его
 * телефон, услуга, мастер, цена, источник и состояние; «…» открывает то же
 * меню действий, что в календаре студии (подтвердить, перенести, отменить).
 * Состояние решает сервер страницы (`journalStatusKey`) — у часов клиента и
 * сервера нет расхождения на границе «идёт / завершена».
 */
export function StudioJournalRow({
  studioId,
  row,
  statusKey,
  masters,
  timezone,
}: {
  studioId: string;
  row: StudioBookingRow;
  statusKey: JournalStatusKey;
  masters: ScheduleMasterColumn[];
  /** Пояс салона: время записи, перенос и меню действий. */
  timezone: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const source = getBookingSourceDisplay(row.source);
  const hasActions = studioCellHasActions(studioCellActions(bookingToCell(row)));
  const inactive = isJournalStatusInactive(statusKey);
  const minutes = durationMinutes(row);
  const proposed =
    row.proposedStartAtUtc && statusKey === "CHANGE_REQUESTED"
      ? UI_FMT.date(row.proposedStartAtUtc, "dayMonthShortTime", { timeZone: timezone })
      : null;

  return (
    <li
      data-testid="booking-row"
      data-focus-id={row.id}
      className={cn(
        "grid grid-cols-[3.75rem_minmax(0,1fr)_auto] gap-x-3 px-3 py-3 transition-colors hover:bg-bg-input/30 sm:grid-cols-[5rem_minmax(0,1fr)_auto] sm:px-4",
        inactive && "text-text-sec",
      )}
    >
      <div className="pt-0.5">
        <p className={cn("font-display text-base font-semibold tabular-nums", inactive ? "text-text-sec line-through" : "text-text-main")}>
          {hm(row.startAtUtc, timezone)}
        </p>
        <p className="text-2xs tabular-nums text-text-sec">{hm(row.endAtUtc, timezone)}</p>
      </div>

      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn("min-w-0 truncate text-sm font-semibold", inactive ? "text-text-sec" : "text-text-main")}>
            {row.client.displayName}
          </span>
          {row.client.isNewClient && !inactive ? (
            <Badge size="xs" variant="success">
              {T.client.newBadge}
            </Badge>
          ) : null}
          {row.client.isVip ? (
            <Badge size="xs" variant="warning">
              {T.client.vipBadge}
            </Badge>
          ) : null}
          <Badge size="xs" variant={JOURNAL_STATUS_TONE[statusKey]} data-testid="booking-row-status">
            {J.status[statusKey]}
          </Badge>
        </div>
        <p className="truncate text-xs text-text-sec">
          {row.service.name}
          {minutes > 0 ? ` · ${UI_FMT.durationLabel(minutes)}` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-sec">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            {row.master.avatarUrl ? (
              <ResilientImage
                src={row.master.avatarUrl}
                alt=""
                width={20}
                height={20}
                className="h-5 w-5 shrink-0 rounded-full object-cover ring-1 ring-border-subtle"
              />
            ) : (
              <span
                aria-hidden
                className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-bg-input text-3xs font-semibold text-text-sec ring-1 ring-border-subtle"
              >
                {initials(row.master.displayName)}
              </span>
            )}
            <span className="truncate">{row.master.displayName}</span>
          </span>
          {row.client.phone ? (
            <a
              href={`tel:${row.client.phone}`}
              title={J.call}
              className="inline-flex items-center gap-1 tabular-nums transition-colors hover:text-text-main"
            >
              <Phone className="h-3.5 w-3.5" aria-hidden />
              {row.client.phone}
            </a>
          ) : null}
        </div>
        {proposed ? <p className="text-xs font-medium text-warning-text">{J.proposed(proposed)}</p> : null}
      </div>

      <div className="flex flex-col items-end gap-1.5">
        <div className="flex items-center gap-1">
          <span
            className={cn(
              "font-display text-sm font-semibold tabular-nums",
              inactive ? "text-text-sec line-through" : "text-text-main",
            )}
          >
            {UI_FMT.priceLabel(row.priceKopeks)}
          </span>
          {hasActions ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setMenuOpen(true)}
              aria-label={T.actions.menu}
              title={T.actions.menu}
              className="-mr-1.5 h-8 w-8 rounded-lg text-text-sec"
              data-testid="booking-row-actions"
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden />
            </Button>
          ) : null}
        </div>
        <span
          className={cn(
            "inline-flex rounded-full border px-2 py-0.5 text-3xs font-medium",
            SOURCE_BADGE_CLASS[source.tone],
          )}
        >
          {T.source[source.labelKey]}
        </span>
      </div>

      <BookingActionMenu
        studioId={studioId}
        booking={menuOpen ? bookingToCell(row) : null}
        masters={masters}
        timezone={timezone}
        onClose={() => setMenuOpen(false)}
      />
    </li>
  );
}
