"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Coffee, Plus, RefreshCw, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";
import { DateNavigator, periodLabel, type ScheduleNavView } from "@/features/schedule-nav/components/date-navigator";
import { FreeWindowsButton } from "@/features/schedule-nav/components/free-windows-dialog";
import { formatZoneLabel, zonesDifferForViewer } from "@/lib/ui/zone-label";
import * as UI_TEXT from "@/lib/ui/text";
import type { StudioScheduleView } from "../lib/view-state";
import type { ScheduleBreakCell, ScheduleMasterColumn, StudioScheduleData } from "../server/types";
import { CreateBookingDialog } from "./dialogs/create-booking-dialog";
import { ManageBreaksDialog } from "./dialogs/manage-breaks-dialog";
import { UI_FMT, VIEWER_TZ } from "@/lib/ui/fmt";

const T = UI_TEXT.studioCabinet.scheduleV2.header;
/** «График команды»: графики всех мастеров, день и «Задать график» по строке. */
const TEAM_SCHEDULE_HREF = "/cabinet/studio/schedule/team";

type Props = {
  studioId: string;
  view: StudioScheduleView;
  dateKey: string;
  /** Сегодня в поясе салона. */
  todayKey: string;
  dayStartIso: string;
  /** FIX-STUDIO-CALENDAR-SALON-TZ: salon tz for the manage-breaks display. */
  timezone: string;
  masters: ScheduleMasterColumn[];
  breaks: ScheduleBreakCell[];
  services: StudioScheduleData["services"];
  /** Свободные окошки периода по активным мастерам. */
  freeWindows: StudioScheduleData["freeWindows"];
};

/**
 * Шапка календаря студии: заголовок, действия, навигация по датам.
 *
 * SCHEDULE-FLEX-DATE-NAV (2026-10-30): вид, стрелки, «Сегодня» и календарь на
 * месяц — общий `DateNavigator` (как у расписания мастера): любая дата —
 * двумя нажатиями, переход показывает ожидание. Адрес — `?view=&date=`
 * (сервер страницы собирает период); сегодняшний день — без `?date`, чтобы
 * сервер взял «сегодня» салона на момент запроса (UX-PASS-01). На телефоне
 * второстепенные действия — значками, строка заголовка не переносится.
 */
export function ScheduleHeader({
  studioId,
  view,
  dateKey,
  todayKey,
  dayStartIso,
  timezone,
  masters,
  breaks,
  services,
  freeWindows,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const viewerTimeZone = useViewerTimeZoneContext();
  // FIX-STUDIO-CALENDAR-SALON-TZ: the whole grid is rendered in the salon's
  // tz. When the admin's browser tz differs (e.g. Moscow admin, +5 salon),
  // annotate «Время салона (город, GMT+N)» once at the header so the admin
  // never mistakes salon times for their own wall clock. Same-tz admins see
  // no label (clean common case).
  const showZoneNote = zonesDifferForViewer({
    iso: dayStartIso,
    salonTimeZone: timezone,
    viewerTimeZone,
  });
  const zoneLabel = showZoneNote ? formatZoneLabel({ iso: dayStartIso, timeZone: timezone }) : "";
  const [navigating, startNavigation] = useTransition();
  const [refreshing, startRefresh] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [breaksOpen, setBreaksOpen] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);

  const navigate = ({ view: nextView, dateKey: nextDate }: { view: ScheduleNavView; dateKey: string }) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", nextView);
    if (nextDate === todayKey) params.delete("date");
    else params.set("date", nextDate);
    startNavigation(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  const handleRefresh = () => {
    startRefresh(() => {
      router.refresh();
      setRefreshedAt(UI_FMT.timeShort(new Date(), { timeZone: VIEWER_TZ }));
    });
  };

  const label = periodLabel(view, dateKey, todayKey);

  return (
    <>
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="min-w-0">
            <h1 className="truncate font-display text-xl font-bold tracking-tight text-text-main md:text-3xl">
              {T.title}
            </h1>
            {zoneLabel ? (
              <p className="mt-1 inline-flex items-center gap-1 rounded-full border border-border-subtle bg-bg-input/50 px-2 py-0.5 text-2xs font-medium text-text-sec">
                {T.salonTimeNote} {zoneLabel}
              </p>
            ) : null}
          </div>
          {/* Вход в «График команды» — на вкладке «Расписание», а не только в
              листе «Ещё»: из PWA владелец правит графики мастеров одним
              нажатием, и подпись у него остаётся и на телефоне (PWA-FIX-05).
              «Перерывы», «Обновить» и «Добавить запись» на телефоне — значками. */}
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Button asChild variant="secondary" size="sm" className="flex-1 whitespace-nowrap rounded-xl sm:flex-none">
              <Link href={TEAM_SCHEDULE_HREF}>
                <SlidersHorizontal className="h-4 w-4" aria-hidden />
                {T.setupSchedule}
              </Link>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setBreaksOpen(true)}
              aria-label={T.manageBreaks}
              title={T.manageBreaks}
              className="w-9 shrink-0 rounded-xl px-0 lg:w-auto lg:px-3"
            >
              <Coffee className="h-4 w-4" aria-hidden />
              <span className="hidden lg:inline">{T.manageBreaks}</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              aria-label={T.refresh}
              title={refreshedAt ? T.refreshedAtTemplate.replace("{time}", refreshedAt) : T.refresh}
              className="w-9 shrink-0 rounded-xl px-0 lg:w-auto lg:px-3"
            >
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} aria-hidden />
              <span className="hidden lg:inline">{T.refresh}</span>
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setCreateOpen(true)}
              aria-label={T.addBooking}
              title={T.addBooking}
              className="w-9 shrink-0 rounded-xl px-0 sm:w-auto sm:px-3"
            >
              <Plus className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">{T.addBooking}</span>
            </Button>
          </div>
        </div>

        <DateNavigator
          view={view}
          dateKey={dateKey}
          todayKey={todayKey}
          onNavigate={navigate}
          pending={navigating}
          labelTestId="studio-schedule-period-label"
          actions={
            <FreeWindowsButton
              sections={freeWindows.map((master) => ({ id: master.masterId, title: master.masterName, days: master.days }))}
              periodLabel={label}
              timeZone={timezone}
              zoneIso={dayStartIso}
            />
          }
        />
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
