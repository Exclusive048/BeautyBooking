"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Coffee, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";
import { formatZoneLabel, zonesDifferForViewer } from "@/lib/ui/zone-label";
import { UI_TEXT } from "@/lib/ui/text";
import {
  addUtcDays,
  parseDateKey,
  toDateKey,
} from "../lib/time-grid";
import type { StudioScheduleView } from "../lib/view-state";
import type {
  ScheduleBreakCell,
  ScheduleKpis,
  ScheduleMasterColumn,
} from "../server/types";
import { CreateBookingDialog } from "./dialogs/create-booking-dialog";
import { ManageBreaksDialog } from "./dialogs/manage-breaks-dialog";

const T = UI_TEXT.studioCabinet.scheduleV2.header;
const WEEKDAY_LONG_RU = [
  "Воскресенье",
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
] as const;
const MONTH_GEN_RU = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
] as const;

type Props = {
  studioId: string;
  view: StudioScheduleView;
  dateKey: string;
  dayStartIso: string;
  /** FIX-STUDIO-CALENDAR-SALON-TZ: salon tz for the manage-breaks display. */
  timezone: string;
  kpis: ScheduleKpis;
  masters: ScheduleMasterColumn[];
  breaks: ScheduleBreakCell[];
  services: Array<{
    id: string;
    name: string;
    durationMin: number;
    priceKopeks: number;
    masterIds: string[];
  }>;
};

export function ScheduleHeader({
  studioId,
  view,
  dateKey,
  dayStartIso,
  timezone,
  kpis,
  masters,
  breaks,
  services,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewerTimeZone = useViewerTimeZoneContext();
  // FIX-STUDIO-CALENDAR-SALON-TZ: the whole grid is rendered in the salon's
  // tz. When the admin's browser tz differs (e.g. Moscow admin, +5 salon),
  // annotate «Время салона (город, GMT+N)» once at the header so the admin
  // never mistakes salon times for their own wall clock. Reuses the single
  // shared zone-label primitive (same as the client cabinet). Same-tz admins
  // see no label (clean common case).
  const showZoneNote = zonesDifferForViewer({
    iso: dayStartIso,
    salonTimeZone: timezone,
    viewerTimeZone,
  });
  const zoneLabel = showZoneNote
    ? formatZoneLabel({ iso: dayStartIso, timeZone: timezone })
    : "";
  const [refreshing, startRefresh] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [breaksOpen, setBreaksOpen] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);

  const date = parseDateKey(dateKey);

  const navigateTo = (params: URLSearchParams) => {
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const handleViewChange = (next: StudioScheduleView) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", next);
    navigateTo(params);
  };

  const handleDateShift = (days: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("date", toDateKey(addUtcDays(date, days)));
    navigateTo(params);
  };

  const handleToday = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("date", toDateKey(new Date()));
    navigateTo(params);
  };

  const handleRefresh = () => {
    startRefresh(() => {
      router.refresh();
      setRefreshedAt(
        new Date().toLocaleTimeString("ru-RU", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    });
  };

  const caption = T.captionTemplate
    .replace("{weekday}", WEEKDAY_LONG_RU[date.getUTCDay()] ?? "")
    .replace("{day}", String(date.getUTCDate()))
    .replace("{month}", MONTH_GEN_RU[date.getUTCMonth()] ?? "")
    .replace("{year}", String(date.getUTCFullYear()));

  return (
    <>
      <header className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
              {caption}
            </p>
            <h1 className="font-display text-2xl font-bold tracking-tight text-text-main md:text-3xl">
              {T.title}
            </h1>
            <p className="mt-1 text-sm text-text-sec">
              {T.subtitleTemplate
                .replace("{bookings}", String(kpis.bookingsCount))
                .replace("{masters}", String(kpis.mastersOnShift))
                .replace("{occupancy}", String(kpis.occupancyPercent))}
            </p>
            {zoneLabel ? (
              <p className="mt-1 inline-flex items-center gap-1 rounded-full border border-border-subtle bg-bg-input/50 px-2 py-0.5 text-[11px] font-medium text-text-sec">
                {T.salonTimeNote} {zoneLabel}
              </p>
            ) : null}
          </div>
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            {T.addBooking}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-xl border border-border-subtle bg-bg-page p-1">
            <button
              type="button"
              onClick={() => handleViewChange("day")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                view === "day"
                  ? "bg-bg-card text-text-main shadow-card"
                  : "bg-transparent text-text-sec hover:text-text-main",
              )}
              aria-pressed={view === "day"}
            >
              {T.views.day}
            </button>
            <button
              type="button"
              onClick={() => handleViewChange("week")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                view === "week"
                  ? "bg-bg-card text-text-main shadow-card"
                  : "bg-transparent text-text-sec hover:text-text-main",
              )}
              aria-pressed={view === "week"}
            >
              {T.views.week}
            </button>
          </div>

          <div className="inline-flex items-center gap-1 rounded-xl border border-border-subtle bg-bg-card">
            <button
              type="button"
              onClick={() => handleDateShift(view === "week" ? -7 : -1)}
              className="h-9 w-9 rounded-l-xl text-text-sec transition-colors hover:bg-bg-input hover:text-text-main"
              aria-label={T.prev}
            >
              <ChevronLeft className="mx-auto h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={handleToday}
              className="px-3 text-sm font-medium text-text-main transition-colors hover:bg-bg-input"
            >
              {T.today}
            </button>
            <button
              type="button"
              onClick={() => handleDateShift(view === "week" ? 7 : 1)}
              className="h-9 w-9 rounded-r-xl text-text-sec transition-colors hover:bg-bg-input hover:text-text-main"
              aria-label={T.next}
            >
              <ChevronRight className="mx-auto h-4 w-4" aria-hidden />
            </button>
          </div>

          <Button
            variant="secondary"
            onClick={() => setBreaksOpen(true)}
          >
            <Coffee className="h-3.5 w-3.5" aria-hidden />
            {T.manageBreaks}
          </Button>

          <Button
            variant="secondary"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw
              className={cn(
                "h-3.5 w-3.5",
                refreshing && "animate-spin",
              )}
              aria-hidden
            />
            {T.refresh}
          </Button>
          {refreshedAt ? (
            <span className="font-mono text-[10px] uppercase tracking-wide text-text-sec">
              {T.refreshedAtTemplate.replace("{time}", refreshedAt)}
            </span>
          ) : null}
        </div>
      </header>

      <CreateBookingDialog
        studioId={studioId}
        masters={masters}
        services={services}
        masterId={null}
        startAtUtc={null}
        timezone={timezone}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />

      <ManageBreaksDialog
        studioId={studioId}
        masters={masters}
        breaks={breaks}
        dayStartIso={dayStartIso}
        timezone={timezone}
        open={breaksOpen}
        onClose={() => setBreaksOpen(false)}
      />
    </>
  );
}
