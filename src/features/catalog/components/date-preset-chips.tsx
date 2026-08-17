"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { CalendarDays } from "lucide-react";
import { ChipButton } from "@/components/ui/chip-button";
import { Skeleton } from "@/components/ui/Skeleton";
import { UI_TEXT } from "@/lib/ui/text";

/**
 * PERF-16 — `react-day-picker` + `date-fns` (+`@date-fns/tz`) статическим
 * импортом давали на `/catalog` чанк 80.7 kB parsed / 23.5 kB gzip, который
 * ехал каждому посетителю каталога. Календарь при этом открывается по клику по
 * чипу, то есть у большинства не открывается вовсе.
 *
 * `ssr: false` здесь ничего не меняет по смыслу: поповер и так рендерится
 * только при `open`, то есть на сервере не рендерился никогда.
 *
 * Скелет размером с сам календарь — чтобы поповер не прыгал, когда чанк
 * доедет. Размеры взяты с отрендеренного `DayPicker` (7 колонок × 6 недель
 * плюс шапка месяца), поэтому подстановка проходит без сдвига.
 */
const DatePresetCalendar = dynamic(
  () => import("@/features/catalog/components/date-preset-calendar"),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[286px] w-[290px]" />,
  },
);

type Props = {
  /** ISO date string (YYYY-MM-DD) or empty when no date picked. */
  value: string;
  onChange: (next: string) => void;
};

const TS = UI_TEXT.catalog2.searchBar;

const SHORT_DATE_FMT = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
});

/** Convert a YYYY-MM-DD string into a Date in the user's local tz, or null. */
function parseIso(value: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map((p) => Number.parseInt(p, 10));
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  return Number.isFinite(dt.getTime()) ? dt : null;
}

/** Inverse of parseIso — formats a Date back into YYYY-MM-DD (local). */
function toIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Three-chip date selector — Today / Tomorrow / Calendar (popover with
 * react-day-picker). Replaces the native `<input type="date">` so the
 * surface fits the brand. Today/Tomorrow are flat shortcuts; the calendar
 * chip morphs to show the picked date when the user steps outside the
 * preset days.
 */
export function DatePresetChips({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Outside-click + ESC to close — mirrors the popover pattern from
  // `filter-chips.tsx` so behaviour is consistent across the app.
  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (event: MouseEvent) => {
      if (!containerRef.current) return;
      const target = event.target;
      if (target instanceof Node && !containerRef.current.contains(target)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const today = startOfDay(new Date());
  const tomorrow = startOfDay(new Date(today.getTime() + 24 * 60 * 60 * 1000));
  const selected = parseIso(value);

  const isToday = Boolean(selected && isSameDay(selected, today));
  const isTomorrow = Boolean(selected && isSameDay(selected, tomorrow));
  const isCustom = Boolean(selected && !isToday && !isTomorrow);

  const calendarLabel = isCustom && selected
    ? SHORT_DATE_FMT.format(selected)
    : TS.calendarChip;

  return (
    <div className="flex items-center gap-1.5">
      <ChipButton
        active={isToday}
        onClick={() => onChange(isToday ? "" : toIso(today))}
      >
        {TS.todayChip}
      </ChipButton>
      <ChipButton
        active={isTomorrow}
        onClick={() => onChange(isTomorrow ? "" : toIso(tomorrow))}
      >
        {TS.tomorrowChip}
      </ChipButton>

      <div ref={containerRef} className="relative">
        <ChipButton active={isCustom} onClick={() => setOpen((v) => !v)}>
          <CalendarDays className="-ml-0.5 mr-1.5 h-3.5 w-3.5" aria-hidden />
          {calendarLabel}
        </ChipButton>

        {open ? (
          <div className="absolute left-0 top-full z-30 mt-2 rounded-2xl border border-border-subtle bg-bg-card p-3 shadow-card">
            <DatePresetCalendar
              selected={selected ?? undefined}
              minDate={today}
              onSelect={(date) => {
                onChange(toIso(date));
                setOpen(false);
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
