import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { WorkContextBadge } from "@/features/master/components/work-context-badge";
import { freeWindowsDayLine } from "@/features/schedule-nav/lib/free-windows-text";
import { cn } from "@/lib/cn";
import type { ScheduleDay } from "@/lib/master/schedule.service";
import { formatLocalHm } from "@/lib/schedule/timezone";
import { UI_FMT } from "@/lib/ui/fmt";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.schedule;

function bookingsLabel(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word =
    mod10 === 1 && mod100 !== 11
      ? T.bookingsLabelOne
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? T.bookingsLabelFew
        : T.bookingsLabelMany;
  return `${UI_FMT.count(n)} ${word}`;
}

type Props = {
  days: ScheduleDay[];
  /** Пояс мастера (rule 17, salon-tz): время записей и окошек — по его часам. */
  timezone: string;
  weekStartIso: string;
  showWorkContext?: boolean;
};

/**
 * SCHEDULE-FLEX-DATE-NAV — неделя на телефоне списком по дням.
 *
 * Сетка из семи колонок на 390px показывала две с половиной колонки и
 * прокручивалась вбок — «неделя не работает» (жалоба владельца). Здесь каждый
 * день — строки записей «10:00–11:30 · клиент · услуга» и свободные окошки
 * под ними; нажатие на день открывает его в дневном виде (там действия над
 * записью и запись в свободное место).
 */
export function WeekAgenda({ days, timezone, weekStartIso, showWorkContext = false }: Props) {
  return (
    <div className="space-y-2" data-testid="schedule-week-agenda">
      {days.map((day) => {
        const free = day.isPast || day.isOff ? null : freeWindowsDayLine(day.freeWindows);
        const href = `/cabinet/master/schedule?view=day&weekStart=${weekStartIso}&day=${day.iso}`;
        return (
          <section
            key={day.iso}
            className={cn(
              "rounded-2xl border bg-bg-card",
              day.weekDay.isToday ? "border-primary/40" : "border-border-subtle",
              day.isPast && "opacity-70",
            )}
          >
            <Link
              href={href}
              scroll={false}
              className="flex items-center justify-between gap-2 rounded-t-2xl px-3 py-2 hover:bg-bg-input"
            >
              <span className={cn("text-sm font-semibold", day.weekDay.isToday ? "text-accent-text" : "text-text-main")}>
                {UI_FMT.dateKey(day.iso, "weekdayDayMonthShort")}
              </span>
              <span className="text-xs text-text-sec">
                {day.isOff && day.bookings.length === 0 ? T.dayOff : bookingsLabel(day.bookings.length)}
              </span>
            </Link>
            {day.bookings.length > 0 ? (
              <ul className="divide-y divide-border-subtle border-t border-border-subtle">
                {day.bookings.map((booking) => {
                  const pending =
                    booking.runtimeStatus === "PENDING" || booking.runtimeStatus === "CHANGE_REQUESTED";
                  return (
                    <li key={booking.id} className="flex items-start gap-3 px-3 py-2">
                      <span className="w-[6.5rem] shrink-0 text-xs font-medium tabular-nums text-text-main">
                        {formatLocalHm(booking.startAtUtc, timezone)}–{formatLocalHm(booking.endAtUtc, timezone)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-sm text-text-main">{booking.clientName}</span>
                          {pending ? (
                            <Badge size="xs" variant="warning">
                              {T.legend.pending}
                            </Badge>
                          ) : null}
                          {showWorkContext ? <WorkContextBadge context={booking.workContext} variant="inline" showLabel={false} /> : null}
                        </span>
                        <span className="block truncate text-xs text-text-sec">{booking.serviceTitle}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : !day.isOff && !day.isPast ? (
              <p className="border-t border-border-subtle px-3 py-2 text-xs text-text-sec">{T.agendaEmpty}</p>
            ) : null}
            {free ? (
              <p className="flex items-start gap-1.5 border-t border-border-subtle px-3 py-2 text-xs text-text-sec">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="min-w-0">{free}</span>
              </p>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
