"use client";

import Link from "next/link";
import { useState } from "react";
import { MessageCircle, MoreHorizontal } from "lucide-react";
import { FocalImage } from "@/components/ui/focal-image";
import { cn } from "@/lib/cn";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";
import {
  BOOKING_CELL_CLASS,
  bookingToneFromStatus,
} from "@/features/studio-cabinet/schedule/lib/booking-status-display";
import { BookingActionMenu } from "@/features/studio-cabinet/schedule/components/dialogs/booking-action-menu";
import type {
  ScheduleBookingCell,
  ScheduleMasterColumn,
} from "@/features/studio-cabinet/schedule/server/types";
import {
  SOURCE_BADGE_CLASS,
  getBookingSourceDisplay,
} from "../lib/source-display";
import type { StudioBookingRow } from "../server/types";

const T = UI_TEXT.studioCabinet.bookingsV2;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : "";
  return (first + last).toUpperCase() || "•";
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function formatDateLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  if (next.getTime() === todayStart.getTime()) return T.table.todayPrefix;
  if (next.getTime() === tomorrowStart.getTime()) return T.table.tomorrowPrefix;
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function statusLabel(status: StudioBookingRow["status"]): string {
  return T.filters.statusLabels[status] ?? status;
}

function bookingToCell(row: StudioBookingRow): ScheduleBookingCell {
  return {
    id: row.id,
    masterId: row.master.id,
    startAtUtc: row.startAtUtc,
    endAtUtc: row.endAtUtc,
    status: row.status,
    tone: bookingToneFromStatus(row.status),
    clientName: row.client.displayName,
    clientPhone: row.client.phone,
    isNewClient: row.client.isNewClient,
    serviceTitle: row.service.name,
    serviceId: "",
    priceKopeks: row.priceKopeks,
  };
}

export function BookingRow({
  studioId,
  row,
  masters,
}: {
  studioId: string;
  row: StudioBookingRow;
  masters: ScheduleMasterColumn[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const sourceDisplay = getBookingSourceDisplay(row.source);
  const tone = bookingToneFromStatus(row.status);

  return (
    <>
      <tr className="border-t border-border-subtle hover:bg-bg-input/30">
        <td className="px-3 py-3 align-top">
          <div className="font-display text-sm font-semibold tabular-nums text-text-main">
            {formatTime(row.startAtUtc)}
          </div>
          <div className="text-[11px] text-text-sec">
            {formatDateLabel(row.startAtUtc)}
          </div>
        </td>
        <td className="px-3 py-3 align-top">
          <div className="flex items-center gap-2">
            {row.master.avatarUrl ? (
              <FocalImage
                src={row.master.avatarUrl}
                alt=""
                width={28}
                height={28}
                className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-border-subtle"
              />
            ) : (
              <span
                aria-hidden
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-bg-input text-[10px] font-semibold text-text-sec ring-1 ring-border-subtle"
              >
                {initials(row.master.displayName)}
              </span>
            )}
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-text-main">
                {row.master.displayName}
              </div>
              {row.master.specialization ? (
                <div className="truncate text-[11px] text-text-sec">
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
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-300">
                {T.client.newBadge}
              </span>
            ) : null}
            {row.client.isVip ? (
              <span className="rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-amber-700 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300">
                {T.client.vipBadge}
              </span>
            ) : null}
          </div>
          {row.client.phone ? (
            <div className="mt-0.5 text-[11px] text-text-sec">
              {row.client.phone}
            </div>
          ) : null}
        </td>
        <td className="px-3 py-3 align-top">
          <div className="text-sm text-text-main">{row.service.name}</div>
          {row.service.durationMin > 0 ? (
            <div className="text-[11px] text-text-sec">
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
              "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium",
              SOURCE_BADGE_CLASS[sourceDisplay.tone],
            )}
          >
            {T.source[sourceDisplay.labelKey]}
          </span>
        </td>
        <td className="px-3 py-3 align-top">
          <span
            className={cn(
              "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium",
              BOOKING_CELL_CLASS[tone].split(" ").filter((c) => !c.startsWith("hover:")).join(" "),
            )}
          >
            {statusLabel(row.status)}
          </span>
        </td>
        <td className="px-2 py-3 align-top">
          <Link
            href={`/cabinet/studio/bookings/${row.id}/chat`}
            className="inline-grid h-8 w-8 place-items-center rounded-lg text-text-sec transition-colors hover:bg-bg-input hover:text-text-main"
            aria-label={T.actions.openChat}
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
          </Link>
        </td>
        <td className="px-2 py-3 align-top">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="inline-grid h-8 w-8 place-items-center rounded-lg text-text-sec transition-colors hover:bg-bg-input hover:text-text-main"
            aria-label={T.actions.menu}
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </button>
        </td>
      </tr>

      <BookingActionMenu
        studioId={studioId}
        booking={menuOpen ? bookingToCell(row) : null}
        masters={masters}
        onClose={() => setMenuOpen(false)}
      />
    </>
  );
}
