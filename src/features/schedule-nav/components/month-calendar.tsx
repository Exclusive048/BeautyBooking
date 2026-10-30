"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { UI_FMT } from "@/lib/ui/fmt";
import * as UI_TEXT from "@/lib/ui/text";
import { mondayOf, monthCells, monthKeyOf, monthParts, shiftMonthKey } from "../lib/month-grid";

const T = UI_TEXT.schedule.monthCalendar;

type Props = {
  /** Выбранная дата салона `YYYY-MM-DD`. */
  value: string;
  /** Сегодня в поясе салона — отмечается рамкой. */
  todayKey: string;
  /** «Неделя» подсвечивает всю неделю выбранной даты, «День» — одну клетку. */
  mode: "day" | "week";
  onSelect: (dateKey: string) => void;
};

/**
 * SCHEDULE-FLEX-DATE-NAV — календарь на месяц для выбора даты расписания.
 *
 * Даты — ключи салона (UTC-tech, `month-grid.ts`): клетка «26» — это 26-е по
 * часам салона независимо от пояса телефона. Месяц листается стрелками без
 * обращения к серверу; выбор дня закрывает панель и ведёт на эту дату.
 */
export function MonthCalendar({ value, todayKey, mode, onSelect }: Props) {
  const [monthKey, setMonthKey] = useState(() => monthKeyOf(value));
  const { year, month } = monthParts(monthKey);
  const selectedWeek = mode === "week" ? mondayOf(value) : null;

  return (
    <div className="w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-border-subtle bg-bg-card p-3 shadow-card">
      <div className="mb-2 flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={T.prevMonth}
          onClick={() => setMonthKey((current) => shiftMonthKey(current, -1))}
          className="h-9 w-9 rounded-lg"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Button>
        <p className="text-sm font-semibold text-text-main" aria-live="polite">
          {`${T.months[month - 1] ?? ""} ${year}`}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={T.nextMonth}
          onClick={() => setMonthKey((current) => shiftMonthKey(current, 1))}
          className="h-9 w-9 rounded-lg"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center">
        {T.weekdays.map((label) => (
          <span key={label} className="eyebrow py-1 text-3xs">
            {label}
          </span>
        ))}
        {monthCells(monthKey).map((key, index) => {
          if (!key) return <span key={`pad-${index}`} aria-hidden />;
          const selected = mode === "day" ? key === value : mondayOf(key) === selectedWeek;
          const isToday = key === todayKey;
          return (
            <Button
              key={key}
              type="button"
              variant="wrapper"
              size="none"
              aria-pressed={selected}
              aria-current={isToday ? "date" : undefined}
              aria-label={UI_FMT.dateKey(key, "weekdayDayMonthLong")}
              onClick={() => onSelect(key)}
              className={cn(
                "flex h-10 items-center justify-center rounded-lg text-sm tabular-nums transition-colors",
                selected ? "bg-primary text-white" : "text-text-main hover:bg-bg-input",
                isToday && !selected && "font-semibold text-accent-text ring-1 ring-inset ring-primary/40",
              )}
            >
              {Number(key.slice(8, 10))}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
