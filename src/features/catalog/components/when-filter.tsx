"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { CalendarDays } from "lucide-react";
import { ChipButton } from "@/components/ui/chip-button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/Skeleton";
import { FREE_SLOT_HORIZON_DAYS } from "@/lib/schedule/free-slot-keys-shared";
import * as UI_TEXT from "@/lib/ui/text";

/**
 * CATALOG-DATE-TIME-FILTER (2026-09-24) — блок «Когда» каталога: день
 * (Сегодня / Завтра / Календарь) и время (Утро / День / Вечер / Свой диапазон).
 * Возвращён после CATALOG-COMPACT-SEARCH, когда у выдачи появилась серверная
 * половина — снимок свободного времени `Provider.freeSlotKeys`.
 *
 * Tz: выбранный день и часы — это день и часы САЛОНА каждого мастера (так их
 * читает сервер, `freeSlotKeysForWhen`); «сегодня» и «завтра» для чипов —
 * по часам зрителя (viewer-tz). Для России это совпадает в пределах суток.
 *
 * Календарь (`react-day-picker`) грузится по клику (PERF-16: 80 kB чанка не
 * должны ехать каждому посетителю каталога).
 */
const DatePresetCalendar = dynamic(() => import("@/features/catalog/components/date-preset-calendar"), {
  ssr: false,
  loading: () => <Skeleton className="h-[286px] w-[290px]" />,
});

const TS = UI_TEXT.catalog2.searchBar;
const TT = UI_TEXT.catalog.timeSearch;

export type WhenTimePreset = "morning" | "day" | "evening" | "custom";

export const WHEN_TIME_PRESET_RANGES: Record<Exclude<WhenTimePreset, "custom">, { from: string; to: string }> = {
  morning: { from: "09:00", to: "12:00" },
  day: { from: "12:00", to: "18:00" },
  evening: { from: "18:00", to: "22:00" },
};

const CUSTOM_DEFAULT = { from: "09:00", to: "12:00" };

const SHORT_DATE_FMT = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });

/** YYYY-MM-DD по часам зрителя. */
export function viewerDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDateKey(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isFinite(date.getTime()) ? date : null;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Подпись выбранного «когда» для съёмного чипа быстрой полосы. */
export function whenFilterLabel(input: {
  date: string;
  timePreset: WhenTimePreset | null;
  timeFrom: string;
  timeTo: string;
  now: Date;
}): string | null {
  const parts: string[] = [];
  const picked = parseDateKey(input.date);
  if (picked) {
    const today = viewerDateKey(input.now);
    const tomorrow = viewerDateKey(addDays(input.now, 1));
    parts.push(
      input.date === today ? TS.todayChip : input.date === tomorrow ? TS.tomorrowChip : SHORT_DATE_FMT.format(picked),
    );
  }
  if (input.timePreset && input.timePreset !== "custom") {
    parts.push(TT[input.timePreset].toLowerCase());
  } else if (input.timeFrom && input.timeTo) {
    parts.push(`${input.timeFrom}–${input.timeTo}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

type Props = {
  date: string;
  timePreset: WhenTimePreset | null;
  timeFrom: string;
  timeTo: string;
  /** Обновления параметров URL; `null` удаляет параметр. */
  onChange: (updates: Record<string, string | null>) => void;
};

export function WhenFilter({ date, timePreset, timeFrom, timeTo, onChange }: Props) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!calendarOpen) return;
    const onDocMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (containerRef.current && target instanceof Node && !containerRef.current.contains(target)) {
        setCalendarOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCalendarOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [calendarOpen]);

  const now = new Date();
  const todayKey = viewerDateKey(now);
  const tomorrowKey = viewerDateKey(addDays(now, 1));
  const picked = parseDateKey(date);
  const isToday = date === todayKey;
  const isTomorrow = date === tomorrowKey;
  const isCustomDate = Boolean(picked && !isToday && !isTomorrow);

  const pickDate = (next: string | null) =>
    // «Сегодня» — тот же фильтр, что «Свободно сегодня»: снимаем обе формы.
    onChange(next ? { date: next } : { date: null, availableToday: null });

  const pickPreset = (preset: Exclude<WhenTimePreset, "custom">) =>
    onChange(
      timePreset === preset
        ? { timePreset: null, timeFrom: null, timeTo: null }
        : { timePreset: preset, timeFrom: null, timeTo: null },
    );

  const toggleCustom = () =>
    onChange(
      timePreset === "custom"
        ? { timePreset: null, timeFrom: null, timeTo: null }
        : {
            timePreset: "custom",
            timeFrom: timeFrom || CUSTOM_DEFAULT.from,
            timeTo: timeTo || CUSTOM_DEFAULT.to,
          },
    );

  const presets: Array<{ value: Exclude<WhenTimePreset, "custom">; label: string }> = [
    { value: "morning", label: TT.morning },
    { value: "day", label: TT.day },
    { value: "evening", label: TT.evening },
  ];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <ChipButton active={isToday} onClick={() => pickDate(isToday ? null : todayKey)}>
          {TS.todayChip}
        </ChipButton>
        <ChipButton active={isTomorrow} onClick={() => pickDate(isTomorrow ? null : tomorrowKey)}>
          {TS.tomorrowChip}
        </ChipButton>
        <div ref={containerRef} className="relative">
          <ChipButton active={isCustomDate} onClick={() => setCalendarOpen((open) => !open)}>
            <CalendarDays className="-ml-0.5 mr-1.5 h-3.5 w-3.5" aria-hidden />
            {isCustomDate && picked ? SHORT_DATE_FMT.format(picked) : TS.calendarChip}
          </ChipButton>
          {calendarOpen ? (
            <div className="absolute left-0 top-full z-30 mt-2 rounded-2xl border border-border-subtle bg-bg-card p-3 shadow-card">
              <DatePresetCalendar
                selected={picked ?? undefined}
                minDate={new Date(now.getFullYear(), now.getMonth(), now.getDate())}
                maxDate={addDays(now, FREE_SLOT_HORIZON_DAYS - 1)}
                onSelect={(next) => {
                  pickDate(viewerDateKey(next));
                  setCalendarOpen(false);
                }}
              />
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {presets.map((preset) => (
          <ChipButton key={preset.value} active={timePreset === preset.value} onClick={() => pickPreset(preset.value)}>
            {preset.label}
          </ChipButton>
        ))}
        <ChipButton active={timePreset === "custom"} onClick={toggleCustom}>
          {TT.custom}
        </ChipButton>
      </div>

      {timePreset === "custom" ? (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-text-sec">
            {TT.from}
            <Input
              type="time"
              step={900}
              value={timeFrom}
              onChange={(event) => onChange({ timeFrom: event.target.value || null })}
              className="h-8 w-auto rounded-full bg-bg-input/90 text-xs"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-text-sec">
            {TT.to}
            <Input
              type="time"
              step={900}
              value={timeTo}
              onChange={(event) => onChange({ timeTo: event.target.value || null })}
              className="h-8 w-auto rounded-full bg-bg-input/90 text-xs"
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
