"use client";

import { useRef, useState, type ReactNode } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { AnchoredPortal } from "@/components/ui/anchored-portal";
import { Button } from "@/components/ui/button";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { cn } from "@/lib/cn";
import { addDaysToDateKey } from "@/lib/schedule/dateKey";
import { UI_FMT } from "@/lib/ui/fmt";
import * as UI_TEXT from "@/lib/ui/text";
import { mondayOf } from "../lib/month-grid";
import { MonthCalendar } from "./month-calendar";

const T = UI_TEXT.schedule.dateNav;

export type ScheduleNavView = "day" | "week";

type Props = {
  view: ScheduleNavView;
  /** Дата салона: выбранный день либо любой день показанной недели. */
  dateKey: string;
  /** Сегодня в поясе салона. */
  todayKey: string;
  /** Переход: вызывающий меняет адрес (вид и дату решает сервер страницы). */
  onNavigate: (target: { view: ScheduleNavView; dateKey: string }) => void;
  /** Страница ещё грузит выбранный период — подпись показывает ожидание. */
  pending?: boolean;
  /** `data-testid` подписи периода (живые прогоны ищут её по нему). */
  labelTestId?: string;
  /** Кнопки рядом с «Сегодня» («Свободные окошки»). */
  actions?: ReactNode;
};

/** Подпись периода: «пт, 30 окт.» / «26 окт. — 1 нояб.»; другой год — с годом. */
export function periodLabel(view: ScheduleNavView, dateKey: string, todayKey: string): string {
  const otherYear = dateKey.slice(0, 4) !== todayKey.slice(0, 4);
  if (view === "day") {
    return UI_FMT.dateKey(dateKey, otherYear ? "dayMonthYearShort" : "weekdayDayMonthShort");
  }
  const monday = mondayOf(dateKey);
  const sunday = addDaysToDateKey(monday, 6);
  const sundayOtherYear = sunday.slice(0, 4) !== todayKey.slice(0, 4);
  return T.weekRange(
    UI_FMT.dateKey(monday, "dayMonthShort"),
    UI_FMT.dateKey(sunday, otherYear || sundayOtherYear ? "dayMonthYearShort" : "dayMonthShort"),
  );
}

/**
 * SCHEDULE-FLEX-DATE-NAV — навигация по датам расписания мастера и календаря
 * студии: вид «День / Неделя», стрелки, подпись периода и «Сегодня».
 *
 * Подпись периода — кнопка: она открывает календарь на месяц, и любая дата
 * («запись через месяц») выбирается двумя нажатиями, а не тридцатью стрелками.
 * Пока сервер отдаёт новый период, на месте значка календаря крутится
 * индикатор — без него переход на медленной сети выглядел как «стрелки не
 * работают» (жалоба владельца).
 */
export function DateNavigator({ view, dateKey, todayKey, onNavigate, pending = false, labelTestId, actions }: Props) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const isDay = view === "day";
  const periodHasToday = isDay ? dateKey === todayKey : mondayOf(dateKey) === mondayOf(todayKey);
  const label = periodLabel(view, dateKey, todayKey);

  const step = (direction: -1 | 1) => onNavigate({ view, dateKey: addDaysToDateKey(dateKey, direction * (isDay ? 1 : 7)) });

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2" aria-busy={pending}>
      <SegmentedTabs<ScheduleNavView>
        ariaLabel={T.viewAria}
        value={view}
        onChange={(next) => {
          if (next !== view) onNavigate({ view: next, dateKey });
        }}
        className="w-36 shrink-0"
        options={[
          { value: "day", label: T.viewDay },
          { value: "week", label: T.viewWeek },
        ]}
      />

      <div className="ml-auto flex shrink-0 items-center gap-2 sm:order-3">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          aria-pressed={periodHasToday}
          onClick={() => {
            if (!periodHasToday) onNavigate({ view, dateKey: todayKey });
          }}
          className={cn("rounded-lg", periodHasToday && "border-primary/40 text-accent-text")}
        >
          {T.today}
        </Button>
        {actions}
      </div>

      <div className="flex w-full min-w-0 items-center gap-1 sm:order-2 sm:w-auto">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={isDay ? T.prevDay : T.prevWeek}
          onClick={() => step(-1)}
          className="h-9 w-9 shrink-0 rounded-lg"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Button>
        <div ref={anchorRef} className="min-w-0 flex-1 sm:flex-none">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            aria-haspopup="dialog"
            aria-expanded={calendarOpen}
            title={T.pickDate}
            onClick={() => setCalendarOpen((open) => !open)}
            className="w-full min-w-0 justify-center rounded-lg sm:min-w-[11rem]"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-text-sec" aria-hidden />
            ) : (
              <CalendarDays className="h-4 w-4 shrink-0 text-text-sec" aria-hidden />
            )}
            <span data-testid={labelTestId} className="truncate tabular-nums">
              {label}
            </span>
            {pending ? <span className="sr-only">{T.loading}</span> : null}
          </Button>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={isDay ? T.nextDay : T.nextWeek}
          onClick={() => step(1)}
          className="h-9 w-9 shrink-0 rounded-lg"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>

      <AnchoredPortal
        open={calendarOpen}
        anchorRef={anchorRef}
        onDismiss={() => setCalendarOpen(false)}
        align="start"
        offset={6}
        flip
      >
        {calendarOpen ? (
          <div role="dialog" aria-label={T.pickDate}>
            <MonthCalendar
              value={dateKey}
              todayKey={todayKey}
              mode={view}
              onSelect={(picked) => {
                setCalendarOpen(false);
                onNavigate({ view, dateKey: picked });
              }}
            />
          </div>
        ) : null}
      </AnchoredPortal>
    </div>
  );
}
