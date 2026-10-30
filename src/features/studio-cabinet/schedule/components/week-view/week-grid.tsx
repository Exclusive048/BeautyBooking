import Link from "next/link";
import { ResilientImage } from "@/components/ui/resilient-image";
import { cn } from "@/lib/cn";
import { freeWindowsMinutes } from "@/lib/schedule/free-windows";
import { formatLocalHm } from "@/lib/schedule/timezone";
import { UI_FMT } from "@/lib/ui/fmt";
import * as UI_TEXT from "@/lib/ui/text";
import { BOOKING_DOT_CLASS } from "../../lib/booking-status-display";
import type { ScheduleWeekData, ScheduleWeekRow } from "../../server/types";

const T = UI_TEXT.studioCabinet.scheduleV2.weekView;
const CELL = UI_TEXT.studioCabinet.scheduleV2.cell;

/** Сколько записей видно в ячейке; остальные — «ещё N», полностью — в дне. */
const VISIBLE_BOOKINGS = 3;

type WeekCell = ScheduleWeekRow["cells"][number];

/** MOBILE-POLISH: подсказка ячейки — записи и занятое время из рабочего по графику. */
function occupancyTitle(cell: WeekCell): string {
  if (cell.fixedSlots !== null) {
    return T.occupancyTitleSlots.replace("{booked}", String(cell.booked)).replace("{slots}", String(cell.fixedSlots));
  }
  return T.occupancyTitleMinutes
    .replace("{booked}", String(cell.booked))
    .replace("{bookedTime}", UI_FMT.durationLabel(cell.bookedMinutes))
    .replace("{capacityTime}", UI_FMT.durationLabel(cell.capacityMinutes ?? 0));
}

/** «свободно 4 часа» / «свободно начал: 3»; прошедший день и нет свободного — `null`. */
function freeLabel(cell: WeekCell, past: boolean): string | null {
  if (past || cell.isDayOff) return null;
  if (cell.freeWindows.freeStarts) {
    const n = cell.freeWindows.freeStarts.length;
    return n > 0 ? T.freeStarts.replace("{n}", String(n)) : null;
  }
  const minutes = freeWindowsMinutes(cell.freeWindows);
  return minutes > 0 ? T.freeTime.replace("{time}", UI_FMT.durationLabel(minutes)) : null;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : "";
  return (first + last).toUpperCase() || "•";
}

function CellBody({ cell, past, timezone }: { cell: WeekCell; past: boolean; timezone: string }) {
  const shown = cell.bookings.slice(0, VISIBLE_BOOKINGS);
  const more = cell.bookings.length - shown.length;
  const free = freeLabel(cell, past);
  return (
    <>
      {cell.isDayOff ? (
        <abbr title={T.dayOffFull} className="block font-mono text-2xs text-text-sec/60 decoration-transparent">
          {T.dayOff}
        </abbr>
      ) : (
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs font-semibold tabular-nums text-text-main">
            {T.occupancyPercent.replace("{percent}", String(cell.percent))}
          </span>
          <span className="h-1 flex-1 overflow-hidden rounded-full bg-bg-input">
            <span className="block h-full rounded-full bg-brand-gradient" style={{ width: `${cell.percent}%` }} />
          </span>
        </div>
      )}
      {shown.length > 0 ? (
        <ul className="mt-1.5 space-y-0.5">
          {shown.map((booking) => (
            <li key={booking.id} className="flex min-w-0 items-center gap-1 text-2xs">
              <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", BOOKING_DOT_CLASS[booking.tone])} />
              <span className="shrink-0 tabular-nums text-text-sec">{formatLocalHm(new Date(booking.startAtUtc), timezone)}</span>
              <span className={cn("min-w-0 truncate", booking.isPersonal ? "italic text-text-sec" : "text-text-main")}>
                {booking.isPersonal ? CELL.personalBooking : booking.clientName}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {more > 0 ? <p className="mt-0.5 text-2xs text-text-sec">{T.bookingsMore.replace("{n}", String(more))}</p> : null}
      {free ? <p className="mt-1 truncate text-2xs text-success-text">{free}</p> : null}
    </>
  );
}

/**
 * Неделя студии на ПК: мастер × день.
 *
 * SCHEDULE-FLEX-DATE-NAV (2026-10-30): в ячейке, кроме загрузки по графику, —
 * сами записи «10:00 Клиент» (до трёх, дальше «ещё N») и свободное время
 * мастера; нажатие открывает день. Время — по часам салона (rule 17, метка
 * пояса — в шапке календаря). На телефоне вместо таблицы — `StudioWeekAgenda`.
 */
export function WeekGrid({ week, timezone }: { week: ScheduleWeekData; timezone: string }) {
  if (week.rows.length === 0) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-bg-card p-8 text-center text-sm text-text-sec">
        {T.empty}
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-border-subtle bg-bg-card">
      <div className="overflow-x-auto">
        {/* Фиксированная раскладка: колонки дней равны, длинное имя клиента
            обрезается, а не раздвигает день (без ширины таблицы `table-fixed`
            не действует). Уже 60rem — прокрутка вбок. */}
        <table className="w-full min-w-[60rem] table-fixed">
          <thead className="bg-bg-input/40">
            <tr>
              {/* UX-PASS-01: полупрозрачный фон закреплённой ячейки пропускал
                  заголовки дней при прокрутке вбок. Плотная подложка карточки +
                  тот же оттенок шапки сверху — вид прежний, просвета нет. */}
              <th className="sticky left-0 z-10 w-44 bg-bg-card bg-[linear-gradient(rgb(var(--bg-input)/0.4),rgb(var(--bg-input)/0.4))] px-3 py-2 text-left eyebrow">
                {T.masterColumn}
              </th>
              {week.days.map((day) => (
                <th
                  key={day.dateKey}
                  className={cn(
                    "px-2 py-2 text-left eyebrow",
                    day.isToday ? "text-accent-text" : "text-text-sec",
                  )}
                >
                  <Link href={`?view=day&date=${day.dateKey}`} scroll={false} className="rounded hover:text-text-main">
                    {day.weekdayLabel} {day.dayNumber}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {week.rows.map((row) => (
              <tr key={row.master.id} className="border-t border-border-subtle">
                <td className="sticky left-0 z-10 w-44 bg-bg-card px-3 py-2.5 align-top">
                  {/* UX-PASS-01: ячейка таблицы растёт под длинное имя, и
                      `truncate` не срабатывал — колонка мастера съедала неделю.
                      Ширина строки ограничена. */}
                  <div className="flex max-w-[152px] items-center gap-2">
                    {row.master.avatarUrl ? (
                      <ResilientImage
                        src={row.master.avatarUrl}
                        alt=""
                        width={24}
                        height={24}
                        className="h-6 w-6 shrink-0 rounded-full object-cover ring-1 ring-border-subtle"
                      />
                    ) : (
                      <span
                        aria-hidden
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-bg-input text-3xs font-semibold text-text-sec ring-1 ring-border-subtle"
                      >
                        {initials(row.master.name)}
                      </span>
                    )}
                    <span className="min-w-0 truncate text-sm font-semibold text-text-main" title={row.master.name}>
                      {row.master.name}
                    </span>
                  </div>
                </td>
                {row.cells.map((cell, index) => {
                  const past = week.days[index]?.isPast ?? false;
                  if (cell.isDayOff && cell.bookings.length === 0) {
                    return (
                      <td key={cell.dateKey} className="px-2 py-2.5 align-top">
                        <CellBody cell={cell} past={past} timezone={timezone} />
                      </td>
                    );
                  }
                  return (
                    <td key={cell.dateKey} className={cn("px-1 py-1.5 align-top", past && "opacity-70")}>
                      <Link
                        href={`?view=day&date=${cell.dateKey}`}
                        scroll={false}
                        title={occupancyTitle(cell)}
                        className="block rounded-lg px-1.5 py-1 transition-colors hover:bg-primary/5"
                      >
                        <CellBody cell={cell} past={past} timezone={timezone} />
                      </Link>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
