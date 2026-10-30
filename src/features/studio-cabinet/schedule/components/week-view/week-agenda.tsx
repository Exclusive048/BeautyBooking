import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { freeWindowsMinutes } from "@/lib/schedule/free-windows";
import { formatLocalHm } from "@/lib/schedule/timezone";
import { UI_FMT } from "@/lib/ui/fmt";
import * as UI_TEXT from "@/lib/ui/text";
import { pluralize } from "@/lib/utils/pluralize";
import { BOOKING_DOT_CLASS } from "../../lib/booking-status-display";
import type { ScheduleWeekBooking, ScheduleWeekData } from "../../server/types";

const T = UI_TEXT.studioCabinet.scheduleV2.weekView;
const CELL = UI_TEXT.studioCabinet.scheduleV2.cell;
const LEGEND = UI_TEXT.studioCabinet.scheduleV2.legend;

type AgendaBooking = ScheduleWeekBooking & { masterName: string };

/**
 * SCHEDULE-FLEX-DATE-NAV — неделя студии на телефоне списком по дням.
 *
 * Таблица «мастер × 7 дней» на 390px показывала полтора дня и прокручивалась
 * вбок, а в ячейке был только процент. Здесь каждый день — записи всех мастеров
 * по времени («10:00–11:30 · клиент», ниже «мастер · услуга») и свободное время
 * по мастерам; заголовок дня открывает его в дневном виде (там действия над
 * записью и запись в свободное место). Время — по часам салона (rule 17).
 */
export function StudioWeekAgenda({ week, timezone }: { week: ScheduleWeekData; timezone: string }) {
  return (
    <div className="space-y-2" data-testid="studio-week-agenda">
      {week.days.map((day, index) => {
        const cells = week.rows.map((row) => ({ master: row.master, cell: row.cells[index] })).filter((item) => item.cell);
        const bookings: AgendaBooking[] = cells
          .flatMap(({ master, cell }) => cell!.bookings.map((booking) => ({ ...booking, masterName: master.name })))
          .sort((a, b) => a.startAtUtc.localeCompare(b.startAtUtc));
        const nobodyWorks = cells.every(({ cell }) => cell!.isDayOff);
        const free = day.isPast
          ? []
          : cells.flatMap(({ master, cell }) => {
              if (cell!.isDayOff) return [];
              const starts = cell!.freeWindows.freeStarts;
              if (starts) {
                return starts.length > 0
                  ? [T.agendaFreeStartsMaster.replace("{master}", master.name).replace("{n}", String(starts.length))]
                  : [];
              }
              const minutes = freeWindowsMinutes(cell!.freeWindows);
              return minutes > 0
                ? [T.agendaFreeMaster.replace("{master}", master.name).replace("{time}", UI_FMT.durationLabel(minutes))]
                : [];
            });
        const count =
          nobodyWorks && bookings.length === 0
            ? T.agendaNobodyWorks
            : `${UI_FMT.count(bookings.length)} ${pluralize(bookings.length, T.agendaBookingOne, T.agendaBookingFew, T.agendaBookingMany)}`;
        return (
          <section
            key={day.dateKey}
            className={cn(
              "rounded-2xl border bg-bg-card",
              day.isToday ? "border-primary/40" : "border-border-subtle",
              day.isPast && "opacity-70",
            )}
          >
            <Link
              href={`?view=day&date=${day.dateKey}`}
              scroll={false}
              className="flex items-center justify-between gap-2 rounded-t-2xl px-3 py-2 hover:bg-bg-input"
            >
              <span className={cn("text-sm font-semibold", day.isToday ? "text-accent-text" : "text-text-main")}>
                {UI_FMT.dateKey(day.dateKey, "weekdayDayMonthShort")}
              </span>
              <span className="text-xs text-text-sec">{count}</span>
            </Link>
            {bookings.length > 0 ? (
              <ul className="divide-y divide-border-subtle border-t border-border-subtle">
                {bookings.map((booking) => (
                  <li key={booking.id} className="flex items-start gap-3 px-3 py-2">
                    <span className="flex w-[6.5rem] shrink-0 items-center gap-1.5 text-xs font-medium tabular-nums text-text-main">
                      <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", BOOKING_DOT_CLASS[booking.tone])} />
                      {formatLocalHm(new Date(booking.startAtUtc), timezone)}–{formatLocalHm(new Date(booking.endAtUtc), timezone)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className={cn("truncate text-sm", booking.isPersonal ? "italic text-text-sec" : "text-text-main")}>
                          {booking.isPersonal ? CELL.personalBooking : booking.clientName}
                        </span>
                        {booking.tone === "pending" ? (
                          <Badge size="xs" variant="warning">
                            {LEGEND.pending}
                          </Badge>
                        ) : null}
                      </span>
                      <span className="block truncate text-xs text-text-sec">
                        {booking.isPersonal || !booking.serviceTitle
                          ? booking.masterName
                          : `${booking.masterName} · ${booking.serviceTitle}`}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : !nobodyWorks && !day.isPast ? (
              <p className="border-t border-border-subtle px-3 py-2 text-xs text-text-sec">{T.agendaEmpty}</p>
            ) : null}
            {free.length > 0 ? (
              <p className="flex items-start gap-1.5 border-t border-border-subtle px-3 py-2 text-xs text-text-sec">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="min-w-0">{free.join(" · ")}</span>
              </p>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
