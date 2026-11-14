"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import { UI_FMT } from "@/lib/ui/fmt";
import * as UI_TEXT from "@/lib/ui/text";
import {
  firstFreeDate,
  type BookableDayStatus,
  type BookableDaysSummary,
} from "@/lib/schedule/bookable-days-shared";
import { monthCells, monthKeyOf, monthParts, shiftMonthKey } from "@/features/schedule-nav/lib/month-grid";

const T = UI_TEXT.bookingCalendar;

type Props = {
  /** Сводка окна записи по дням (`useBookableDays`). */
  summary: BookableDaysSummary | null;
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  /** Выбранная дата салона `YYYY-MM-DD`. */
  value: string | null;
  onSelect: (dateKey: string) => void;
  /** Сегодня в поясе салона — отмечается рамкой. */
  todayKey?: string | null;
  /**
   * `free` — клиент: выбрать можно только день со свободным временем.
   * `window` — ручная запись: любой день окна, чтобы увидеть, ПОЧЕМУ в нём нет
   * окошек (выходной, всё занято).
   */
  selectable: "free" | "window";
  /** Дни раньше — недоступны (следующая услуга пакета не раньше предыдущей). */
  minDateKey?: string | null;
  /** День, доступный при любом статусе (день окончания предыдущей услуги пакета). */
  forceSelectableDate?: string | null;
  /** Пока идёт отправка формы — дни не выбираются. */
  disabled?: boolean;
  label?: string;
  className?: string;
  testId?: string;
};

type Cell = {
  key: string;
  status: BookableDayStatus | null;
  enabled: boolean;
};

const STATUS_TEXT: Record<BookableDayStatus, string> = {
  free: T.statusFree,
  busy: T.statusBusy,
  off: T.statusOff,
};

/**
 * BOOKING-DATE-CALENDAR (2026-11-13, запрос владельца) — календарь выбора даты
 * записи вместо горизонтальной полосы дней: ручная запись в кабинетах мастера и
 * студии, виджеты записи к мастеру и в студию.
 *
 * Дни — ключи салона (`month-grid.ts`, UTC-tech): клетка «14» — 14-е по часам
 * салона независимо от пояса телефона (rule 17). Статус дня приходит сводкой
 * сервера (`?days=1`, `bookable-days.ts`) — тем же движком и окном записи, что
 * окошки: точка под числом — «есть свободное время», бледная — «всё занято».
 *
 * Месяц листается без запроса: сводка покрывает всё окно записи (до 93 дней).
 * Выбранная дата снаружи (предвыбор, автоподбор первого свободного дня) сама
 * показывает свой месяц.
 */
export function BookingDateCalendar({
  summary,
  loading,
  error,
  onRetry,
  value,
  onSelect,
  todayKey = null,
  selectable,
  minDateKey = null,
  forceSelectableDate = null,
  disabled = false,
  label = T.label,
  className,
  testId,
}: Props) {
  const statusByDate = useMemo(
    () => new Map((summary?.days ?? []).map((day) => [day.date, day.status] as const)),
    [summary],
  );

  // Месяц, который человек пролистал стрелками; смена выбранной даты снаружи
  // сбрасывает его — календарь показывает месяц выбранного дня.
  const [browsedMonth, setBrowsedMonth] = useState<string | null>(null);
  const [syncedValue, setSyncedValue] = useState(value);
  if (value !== syncedValue) {
    setSyncedValue(value);
    setBrowsedMonth(null);
  }

  const firstMonth = summary ? monthKeyOf(summary.firstDate) : null;
  const lastMonth = summary ? monthKeyOf(summary.lastDate) : null;
  const anchor =
    value ?? (summary ? (firstFreeDate(summary, minDateKey ?? undefined) ?? summary.firstDate) : todayKey);
  const shownMonth = clampMonth(browsedMonth ?? (anchor ? monthKeyOf(anchor) : null), firstMonth, lastMonth);

  if (loading || (!summary && !error)) {
    return (
      <div className={cn("w-full", className)} data-testid={testId}>
        <p className="sr-only" role="status">
          {T.loading}
        </p>
        <div className="mb-2 flex h-9 items-center justify-center">
          <Skeleton className="h-4 w-32 rounded-md" />
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 35 }, (_, index) => (
            <Skeleton key={index} className="h-11 rounded-lg sm:h-10" />
          ))}
        </div>
      </div>
    );
  }

  if (!summary || !shownMonth) {
    return (
      <div className={cn("w-full", className)} data-testid={testId}>
        <Notice tone="danger" className="flex flex-wrap items-center justify-between gap-2">
          <span>{error ?? T.loadFailed}</span>
          {onRetry ? (
            <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
              {T.retry}
            </Button>
          ) : null}
        </Notice>
      </div>
    );
  }

  const { year, month } = monthParts(shownMonth);
  const cells: Array<Cell | null> = monthCells(shownMonth).map((key) => {
    if (!key) return null;
    const inWindow =
      key >= summary.firstDate && key <= summary.lastDate && (!minDateKey || key >= minDateKey);
    const status = inWindow ? (statusByDate.get(key) ?? "off") : null;
    const enabled =
      status !== null && (selectable === "window" || status === "free" || key === forceSelectableDate);
    return { key, status, enabled };
  });
  const hint = resolveHint(summary, selectable, minDateKey, forceSelectableDate);

  return (
    <div className={cn("w-full", className)} role="group" aria-label={label} data-testid={testId}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={T.prevMonth}
          disabled={!firstMonth || shownMonth <= firstMonth}
          onClick={() => setBrowsedMonth(shiftMonthKey(shownMonth, -1))}
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
          disabled={!lastMonth || shownMonth >= lastMonth}
          onClick={() => setBrowsedMonth(shiftMonthKey(shownMonth, 1))}
          className="h-9 w-9 rounded-lg"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {T.weekdays.map((weekday) => (
          <span key={weekday} className="eyebrow py-1 text-3xs" aria-hidden>
            {weekday}
          </span>
        ))}
        {cells.map((cell, index) => {
          if (!cell) return <span key={`pad-${index}`} aria-hidden />;
          const selected = cell.key === value;
          const isToday = cell.key === todayKey;
          const statusText = cell.status ? STATUS_TEXT[cell.status] : T.statusOutside;
          return (
            <Button
              key={cell.key}
              type="button"
              variant="wrapper"
              size="none"
              disabled={disabled || !cell.enabled}
              aria-pressed={selected}
              aria-current={isToday ? "date" : undefined}
              aria-label={`${UI_FMT.dateKey(cell.key, "weekdayDayMonthLong")} — ${statusText}`}
              data-date={cell.key}
              data-status={cell.status ?? "outside"}
              onClick={() => onSelect(cell.key)}
              className={cn(
                "relative flex h-11 flex-col items-center justify-center gap-0.5 rounded-lg text-sm tabular-nums transition-colors disabled:opacity-100 sm:h-10",
                cellTone(cell, selected),
                isToday && !selected && "font-semibold ring-1 ring-inset ring-primary/40",
              )}
            >
              <span className="leading-none">{Number(cell.key.slice(8, 10))}</span>
              <span
                aria-hidden
                className={cn("h-1 w-1 rounded-full", dotTone(cell.status, selected))}
              />
            </Button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-text-sec" aria-hidden>
        <LegendItem dotClassName="bg-accent-text" text={T.legendFree} />
        <LegendItem dotClassName="bg-text-placeholder" text={T.legendBusy} />
        <LegendItem dotClassName="border border-text-placeholder" text={T.legendOff} />
      </div>

      {hint ? (
        <Notice tone="muted" className="mt-3">
          {hint}
        </Notice>
      ) : null}
    </div>
  );
}

function LegendItem({ dotClassName, text }: { dotClassName: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-1.5 w-1.5 rounded-full", dotClassName)} />
      {text}
    </span>
  );
}

function cellTone(cell: Cell, selected: boolean): string {
  if (selected) return "bg-primary font-semibold text-white";
  if (cell.status === null) return "text-text-placeholder/60";
  if (!cell.enabled) {
    return cell.status === "busy" ? "text-text-sec" : "text-text-placeholder";
  }
  if (cell.status === "free") return "font-medium text-text-main hover:bg-bg-input";
  // Ручная запись: рабочий день без окошек и выходной выбираются, но тише.
  return cell.status === "busy" ? "text-text-sec hover:bg-bg-input" : "text-text-placeholder hover:bg-bg-input";
}

function dotTone(status: BookableDayStatus | null, selected: boolean): string {
  if (status === "free") return selected ? "bg-white" : "bg-accent-text";
  if (status === "busy") return selected ? "bg-white/60" : "bg-text-placeholder";
  // Выходной в окне записи — контур, как в легенде: иначе его не отличить от
  // дня вне окна (прошедшего или за «Максимумом вперёд»).
  if (status === "off") return selected ? "border border-white/70" : "border border-text-placeholder";
  return "bg-transparent";
}

function clampMonth(monthKey: string | null, firstMonth: string | null, lastMonth: string | null): string | null {
  if (!monthKey) return firstMonth;
  if (firstMonth && monthKey < firstMonth) return firstMonth;
  if (lastMonth && monthKey > lastMonth) return lastMonth;
  return monthKey;
}

/** Почему выбрать нечего — подсказка под календарём. */
function resolveHint(
  summary: BookableDaysSummary,
  selectable: "free" | "window",
  minDateKey: string | null,
  forceSelectableDate: string | null,
): string | null {
  const days = summary.days.filter((day) => !minDateKey || day.date >= minDateKey);
  if (days.length === 0) return T.windowClosed;
  if (selectable === "free") {
    const hasChoice = days.some((day) => day.status === "free" || day.date === forceSelectableDate);
    return hasChoice ? null : T.noFreeDays;
  }
  return days.every((day) => day.status === "off") ? T.noWorkingDays : null;
}
