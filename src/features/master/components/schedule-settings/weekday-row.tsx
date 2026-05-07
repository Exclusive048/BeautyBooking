"use client";

import type { InputHTMLAttributes } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";
import type { BreakDto, DayScheduleDto } from "@/lib/schedule/editor-shared";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.scheduleSettings.week;

const DAY_LABELS: Record<number, string> = {
  0: T.days.mon,
  1: T.days.tue,
  2: T.days.wed,
  3: T.days.thu,
  4: T.days.fri,
  5: T.days.sat,
  6: T.days.sun,
};

type Props = {
  day: DayScheduleDto;
  onChange: (next: DayScheduleDto) => void;
};

/**
 * Single weekday row inside the Hours tab.
 *
 * - FLEXIBLE mode: start/end interval + optional list of breaks.
 *   Per backend constraint there is exactly one interval per day — to
 *   split the day, the master adds a break.
 * - FIXED mode: list of explicit start times (chips). Each chip is an
 *   editable `<TimeField>` with a remove button; "+ Добавить точку" appends
 *   a new time. Times are kept sorted ascending and deduplicated on every
 *   change so the snapshot serialises consistently.
 */
export function WeekdayRow({ day, onChange }: Props) {
  const isFixed = day.scheduleMode === "FIXED";

  const setWorkday = (next: boolean) => onChange({ ...day, isWorkday: next });
  const setStart = (next: string) => onChange({ ...day, startTime: next });
  const setEnd = (next: string) => onChange({ ...day, endTime: next });

  const addBreak = () => {
    const lastEnd = day.breaks.length > 0 ? day.breaks[day.breaks.length - 1].end : day.startTime;
    const fallbackStart = lastEnd ?? "13:00";
    onChange({
      ...day,
      breaks: [...day.breaks, { start: fallbackStart, end: addMinutes(fallbackStart, 30) }],
    });
  };

  const updateBreak = (index: number, patch: Partial<BreakDto>) => {
    const next = day.breaks.map((row, idx) => (idx === index ? { ...row, ...patch } : row));
    onChange({ ...day, breaks: next });
  };

  const removeBreak = (index: number) => {
    onChange({ ...day, breaks: day.breaks.filter((_row, idx) => idx !== index) });
  };

  const setFixedTimes = (next: string[]) => {
    const sorted = Array.from(new Set(next)).sort((left, right) => left.localeCompare(right));
    onChange({ ...day, fixedSlotTimes: sorted });
  };

  const addFixedTime = () => setFixedTimes([...day.fixedSlotTimes, defaultNewFixedTime(day.fixedSlotTimes)]);
  const removeFixedTime = (index: number) =>
    setFixedTimes(day.fixedSlotTimes.filter((_, idx) => idx !== index));
  const updateFixedTime = (index: number, value: string) =>
    setFixedTimes(day.fixedSlotTimes.map((time, idx) => (idx === index ? value : time)));

  return (
    <div
      className={cn(
        "rounded-2xl border border-border-subtle bg-bg-card p-4 transition-colors",
        !day.isWorkday && "opacity-70"
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex w-10 shrink-0 items-center justify-center rounded-xl bg-bg-input py-2 text-sm font-medium text-text-main">
          {DAY_LABELS[day.dayOfWeek]}
        </div>

        <Switch
          size="sm"
          checked={day.isWorkday}
          onCheckedChange={setWorkday}
          aria-label={day.isWorkday ? T.onLabel : T.offLabel}
        />

        <div className="flex flex-1 flex-wrap items-center gap-2">
          {day.isWorkday && !isFixed ? (
            <>
              <TimeField
                value={day.startTime}
                onChange={setStart}
                aria-label={T.startLabel}
              />
              <span className="text-sm text-text-sec">—</span>
              <TimeField
                value={day.endTime}
                onChange={setEnd}
                aria-label={T.endLabel}
              />
            </>
          ) : !day.isWorkday ? (
            <span className="text-sm text-text-sec">{T.offLabel}</span>
          ) : null}
        </div>
      </div>

      {day.isWorkday && isFixed ? (
        <div className="mt-3 space-y-2 pl-[3.25rem]">
          <div className="text-xs uppercase tracking-wide text-text-sec">
            {T.fixedTimesLabel}
          </div>
          {day.fixedSlotTimes.length === 0 ? (
            <p className="text-xs italic text-text-sec/70">{T.fixedTimesEmpty}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {day.fixedSlotTimes.map((time, index) => (
                <div
                  key={`${time}-${index}`}
                  className="inline-flex items-center gap-0.5 rounded-lg border border-border-subtle bg-bg-page py-0.5 pl-1.5 pr-0.5"
                >
                  <TimeField
                    value={time}
                    onChange={(next) => updateFixedTime(index, next)}
                    aria-label={`${T.fixedTimesLabel} · ${time}`}
                    className="h-8 w-[5.5rem] rounded-md border-0 bg-transparent px-1 text-sm shadow-none focus:bg-bg-input"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeFixedTime(index)}
                    aria-label={`${T.removeFixedTimeAria} ${time}`}
                    className="h-7 w-7 rounded-md"
                  >
                    <X className="h-3 w-3" aria-hidden />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addFixedTime}
            className="rounded-lg text-text-sec hover:text-text-main"
          >
            <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
            {T.addFixedTime}
          </Button>
        </div>
      ) : null}

      {day.isWorkday && !isFixed ? (
        <div className="mt-3 space-y-2 pl-[3.25rem]">
          {day.breaks.length > 0 ? (
            <div className="text-xs uppercase tracking-wide text-text-sec">
              {T.breaksLabel}
            </div>
          ) : null}
          {day.breaks.map((row, index) => (
            <div key={index} className="flex flex-wrap items-center gap-2">
              <TimeField
                value={row.start}
                onChange={(next) => updateBreak(index, { start: next })}
                aria-label={`${T.breaksLabel} · ${T.startLabel}`}
              />
              <span className="text-sm text-text-sec">—</span>
              <TimeField
                value={row.end}
                onChange={(next) => updateBreak(index, { end: next })}
                aria-label={`${T.breaksLabel} · ${T.endLabel}`}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeBreak(index)}
                aria-label={T.removeBreakAria}
                className="h-8 w-8 rounded-lg"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addBreak}
            className="rounded-lg text-text-sec hover:text-text-main"
          >
            <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
            {T.addBreak}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function TimeField({
  value,
  onChange,
  ...rest
}: { value: string; onChange: (next: string) => void } & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange"
>) {
  return (
    <Input
      type="time"
      step={300}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 w-[6.5rem] rounded-lg px-2 text-sm"
      {...rest}
    />
  );
}

function addMinutes(time: string, delta: number): string {
  const [hourRaw, minuteRaw] = time.split(":");
  const total = (Number(hourRaw) * 60 + Number(minuteRaw) + delta + 24 * 60) % (24 * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/**
 * Picks the default for a freshly-added FIXED slot point: empty list → 10:00,
 * otherwise last (sorted) + 1 hour, clamped to 23:00. Caller dedupes/sorts
 * the resulting array.
 */
function defaultNewFixedTime(existing: string[]): string {
  if (existing.length === 0) return "10:00";
  const sorted = [...existing].sort((left, right) => left.localeCompare(right));
  const last = sorted[sorted.length - 1];
  const [h, m] = last.split(":").map(Number);
  const total = h * 60 + m + 60;
  if (total >= 23 * 60) return "23:00";
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
