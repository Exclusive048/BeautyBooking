"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { ResilientImage } from "@/components/ui/resilient-image";
import { cn } from "@/lib/cn";
import { formatLocalHm, toLocalDateKey } from "@/lib/schedule/timezone";
import { UI_FMT } from "@/lib/ui/fmt";
import * as UI_TEXT from "@/lib/ui/text";
import {
  BOOKING_CELL_CLASS,
  bookingToneFromStatus,
} from "@/features/studio-cabinet/schedule/lib/booking-status-display";
import { BookingActionMenu } from "@/features/studio-cabinet/schedule/components/dialogs/booking-action-menu";
import type { ScheduleMasterColumn } from "@/features/studio-cabinet/schedule/server/types";
import { bookingToCell } from "../lib/booking-to-cell";
import {
  SOURCE_BADGE_CLASS,
  getBookingSourceDisplay,
} from "../lib/source-display";
import type { StudioBookingRow } from "../server/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const T = UI_TEXT.studioCabinet.bookingsV2;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : "";
  return (first + last).toUpperCase() || "•";
}

function formatTime(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return formatLocalHm(date, timeZone);
}

function formatDateLabel(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  // FIX-STUDIO-CALENDAR-SALON-TZ: today/tomorrow + the date are resolved in
  // the salon's tz, so a cross-tz admin near midnight sees the salon's day.
  const now = new Date();
  const dayKey = toLocalDateKey(date, timeZone);
  const todayKey = toLocalDateKey(now, timeZone);
  const tomorrowKey = toLocalDateKey(
    new Date(now.getTime() + 24 * 60 * 60 * 1000),
    timeZone,
  );
  if (dayKey === todayKey) return T.table.todayPrefix;
  if (dayKey === tomorrowKey) return T.table.tomorrowPrefix;
  return UI_FMT.date(date, "dayMonthShort", { timeZone });
}

function statusLabel(status: StudioBookingRow["status"]): string {
  return T.filters.statusLabels[status] ?? status;
}

export function BookingRow({
  studioId,
  row,
  masters,
  timezone,
}: {
  studioId: string;
  row: StudioBookingRow;
  masters: ScheduleMasterColumn[];
  /** FIX-STUDIO-CALENDAR-SALON-TZ: salon tz for time + date + action menu. */
  timezone: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const sourceDisplay = getBookingSourceDisplay(row.source);
  const tone = bookingToneFromStatus(row.status);

  return (
    <>
      <tr className="border-t border-border-subtle hover:bg-bg-input/30">
        <td className="px-3 py-3 align-top">
          <div className="font-display text-sm font-semibold tabular-nums text-text-main">
            {formatTime(row.startAtUtc, timezone)}
          </div>
          <div className="text-2xs text-text-sec">
            {formatDateLabel(row.startAtUtc, timezone)}
          </div>
        </td>
        <td className="px-3 py-3 align-top">
          <div className="flex items-center gap-2">
            {row.master.avatarUrl ? (
              <ResilientImage
                src={row.master.avatarUrl}
                alt=""
                width={28}
                height={28}
                className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-border-subtle"
              />
            ) : (
              <span
                aria-hidden
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-bg-input text-3xs font-semibold text-text-sec ring-1 ring-border-subtle"
              >
                {initials(row.master.displayName)}
              </span>
            )}
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-text-main">
                {row.master.displayName}
              </div>
              {row.master.specialization ? (
                <div className="truncate text-2xs text-text-sec">
                  {row.master.specialization}
                </div>
              ) : null}
            </div>
          </div>
        </td>
        <td className="px-3 py-3 align-top">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm text-text-main">
              {row.client.displayName}
            </span>
            {row.client.isNewClient ? (
              <Badge size="xs" variant="success">
                {T.client.newBadge}
              </Badge>
            ) : null}
            {row.client.isVip ? (
              <Badge size="xs" variant="warning">
                {T.client.vipBadge}
              </Badge>
            ) : null}
          </div>
          {row.client.phone ? (
            <div className="mt-0.5 text-2xs text-text-sec">
              {row.client.phone}
            </div>
          ) : null}
        </td>
        <td className="px-3 py-3 align-top">
          <div className="text-sm text-text-main">{row.service.name}</div>
          {row.service.durationMin > 0 ? (
            <div className="text-2xs text-text-sec">
              {T.table.durationTemplate.replace(
                "{min}",
                String(row.service.durationMin),
              )}
            </div>
          ) : null}
        </td>
        <td className="px-3 py-3 align-top text-right font-display text-sm font-semibold tabular-nums text-text-main">
          {UI_FMT.priceLabel(row.priceKopeks)}
        </td>
        <td className="px-3 py-3 align-top">
          <span
            className={cn(
              "inline-flex rounded-full border px-2 py-0.5 text-3xs font-medium",
              SOURCE_BADGE_CLASS[sourceDisplay.tone],
            )}
          >
            {T.source[sourceDisplay.labelKey]}
          </span>
        </td>
        <td className="px-3 py-3 align-top">
          <span
            className={cn(
              "inline-flex rounded-full px-2 py-0.5 text-3xs font-medium",
              BOOKING_CELL_CLASS[tone].split(" ").filter((c) => !c.startsWith("hover:")).join(" "),
            )}
          >
            {statusLabel(row.status)}
          </span>
        </td>
        <td className="px-2 py-3 align-top">
          <Button variant="wrapper"
            onClick={() => setMenuOpen(true)}
            className="inline-grid h-8 w-8 place-items-center rounded-lg text-text-sec transition-colors hover:bg-bg-input hover:text-text-main"
            aria-label={T.actions.menu}
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </Button>
        </td>
      </tr>

      <BookingActionMenu
        studioId={studioId}
        booking={menuOpen ? bookingToCell(row) : null}
        masters={masters}
        timezone={timezone}
        onClose={() => setMenuOpen(false)}
      />
    </>
  );
}
