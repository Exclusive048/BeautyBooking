"use client";

import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TimeAxis } from "@/features/master/components/schedule/time-axis";
import { cn } from "@/lib/cn";
import * as UI_TEXT from "@/lib/ui/text";
import { SCHEDULE_DAY_PARAM, replaceDayInUrl, resolveSelectedDayIso } from "./schedule-view-state";

const T = UI_TEXT.cabinetMaster.schedule.controls;

export type DayStripItem = {
  iso: string;
  shortLabel: string;
  dayNumber: number;
  isToday: boolean;
  isOff: boolean;
  bookingsCount: number;
};

type Props = {
  weekStartIso: string;
  todayIso: string;
  days: DayStripItem[];
  hourRange: { start: number; end: number };
  hourPx: number;
  /** Server-rendered day columns keyed by iso — the same `WeekGridColumn`s the week grid uses. */
  columns: Record<string, ReactNode>;
};

/**
 * PWA-UX-BATCH-01 — дневной вид расписания для телефона.
 *
 * Недельная сетка на 375px показывала ~2,5 колонки из семи и требовала
 * горизонтальной прокрутки по дням (владелец: «не очень скроллить по дням»).
 * Здесь неделя — полоса из семи чипов, а под ней ОДНА колонка выбранного дня
 * во всю ширину: та же `WeekGridColumn` (карточки, блокировки,
 * click-to-create), что и в недельной сетке — колонки приходят с сервера
 * готовыми узлами, компонент лишь выбирает, какую показать. Выбранный день —
 * `?day=` через `history.replaceState`, без запроса к серверу.
 */
export function DayView({ weekStartIso, todayIso, days, hourRange, hourPx, columns }: Props) {
  const searchParams = useSearchParams();
  const selectedIso = resolveSelectedDayIso({
    dayParam: searchParams.get(SCHEDULE_DAY_PARAM),
    weekStartIso,
    todayIso,
  });

  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-card" data-testid="schedule-day-view">
      <div
        role="tablist"
        aria-label={T.dayStripAria}
        className="grid grid-cols-7 gap-1 border-b border-border-subtle p-2"
      >
        {days.map((day) => {
          const selected = day.iso === selectedIso;
          return (
            <Button
              key={day.iso}
              type="button"
              variant="wrapper"
              size="none"
              role="tab"
              aria-selected={selected}
              data-testid={`schedule-day-chip-${day.iso}`}
              onClick={() => replaceDayInUrl(day.iso)}
              className={cn(
                "flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 transition-colors",
                selected
                  ? "bg-brand-gradient text-white shadow-sm"
                  : day.isToday
                    ? "bg-primary/10 text-accent-text"
                    : "text-text-main hover:bg-bg-input",
                !selected && day.isOff && "text-text-sec/60",
              )}
            >
              <span
                className={cn(
                  "eyebrow",
                  selected ? "text-white/80" : "text-text-sec",
                )}
              >
                {day.shortLabel}
              </span>
              <span className="font-display text-base leading-none">{day.dayNumber}</span>
              <span
                aria-hidden
                className={cn(
                  "h-1 w-1 rounded-full",
                  day.bookingsCount > 0 ? (selected ? "bg-white/80" : "bg-primary") : "bg-transparent",
                )}
              />
            </Button>
          );
        })}
      </div>

      <div className="grid" style={{ gridTemplateColumns: "48px minmax(0, 1fr)" }}>
        <TimeAxis hourStart={hourRange.start} hourEnd={hourRange.end} hourPx={hourPx} />
        <div key={selectedIso} className="min-w-0">
          {columns[selectedIso] ?? null}
        </div>
      </div>
    </div>
  );
}
