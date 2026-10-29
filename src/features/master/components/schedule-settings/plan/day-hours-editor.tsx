"use client";

import { Clock, Grid3x3, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as UI_TEXT from "@/lib/ui/text";
import { cn } from "@/lib/cn";
import { ModeCard } from "@/components/ui/mode-card";
import { suggestNextBreak, type DayBreakDraft, type DayHoursDraft, type DayHoursError } from "./lib/day-hours";

const T = UI_TEXT.cabinetMaster.scheduleSettings.wizard.hours;

/** Текст ошибки черновика часов — один на окно графика, палитру, «свои часы» и график команды. */
export function dayHoursErrorText(error: DayHoursError | null): string | null {
  if (error === "noFixedTimes") return T.noFixedTimes;
  if (error === "breakOutside") return T.breakOutside;
  if (error === "breakOverlap") return T.breakOverlap;
  if (error === "invalidRange") return T.invalidRange;
  return null;
}

/**
 * SCHEDULE-PATTERNS-01 (этап 3) — часы рабочего дня: режим записи, начало и
 * конец, перерывы или времена приёма. Общий для пошагового окна, палитры и
 * «своих часов» дня в календаре. Перерывов — сколько угодно
 * (SCHEDULE-BREAKS-MANY): у «Фиксированного времени» их нет, там окошки — сами
 * выбранные времена.
 */
export function DayHoursEditor({
  value,
  onChange,
  allowFixed = true,
  compact = false,
}: {
  value: DayHoursDraft;
  onChange: (next: DayHoursDraft) => void;
  /** Разрешить «Фиксированное время» (у «своих часов» дня и разных часов по дням — нет). */
  allowFixed?: boolean;
  /** Только «начало — конец + перерывы», без выбора режима (списки по дням). */
  compact?: boolean;
}) {
  const set = (patch: Partial<DayHoursDraft>) => onChange({ ...value, ...patch });
  const setBreak = (index: number, patch: Partial<DayBreakDraft>) =>
    set({ breaks: value.breaks.map((item, i) => (i === index ? { ...item, ...patch } : item)) });

  const flexible = (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <ScheduleField label={T.startLabel}>
          <TimeInput ariaLabel={T.startLabel} value={value.startTime} onChange={(startTime) => set({ startTime })} />
        </ScheduleField>
        <ScheduleField label={T.endLabel}>
          <TimeInput ariaLabel={T.endLabel} value={value.endTime} onChange={(endTime) => set({ endTime })} />
        </ScheduleField>
      </div>
      {value.breaks.length > 0 ? (
        <ScheduleField label={T.breaksLabel}>
          <ul className="space-y-2">
            {value.breaks.map((item, index) => (
              <li key={index} className="flex items-center gap-2">
                <div className="grid flex-1 grid-cols-2 gap-2">
                  <TimeInput
                    ariaLabel={T.breakStartAria(index + 1)}
                    value={item.start}
                    onChange={(start) => setBreak(index, { start })}
                  />
                  <TimeInput
                    ariaLabel={T.breakEndAria(index + 1)}
                    value={item.end}
                    onChange={(end) => setBreak(index, { end })}
                  />
                </div>
                <Button
                  type="button"
                  variant="icon"
                  size="icon"
                  aria-label={T.removeBreakAria(index + 1)}
                  onClick={() => set({ breaks: value.breaks.filter((_, i) => i !== index) })}
                >
                  <X className="h-4 w-4" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        </ScheduleField>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="rounded-xl"
        onClick={() => set({ breaks: [...value.breaks, suggestNextBreak(value)] })}
      >
        <Plus className="mr-1.5 h-4 w-4" aria-hidden />
        {T.addBreak}
      </Button>
    </div>
  );

  if (compact || !allowFixed) return flexible;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ModeCard
          active={value.mode === "FLEXIBLE"}
          icon={Clock}
          title={T.modeFlexible}
          description={T.modeFlexibleHint}
          onClick={() => set({ mode: "FLEXIBLE" })}
        />
        <ModeCard
          active={value.mode === "FIXED"}
          icon={Grid3x3}
          title={T.modeFixed}
          description={T.modeFixedHint}
          onClick={() => set({ mode: "FIXED" })}
        />
      </div>
      {value.mode === "FLEXIBLE" ? (
        flexible
      ) : (
        <ScheduleField label={T.fixedTimesLabel}>
          <div className="flex flex-wrap items-center gap-2">
            {value.fixedTimes.map((time, index) => (
              <div key={index} className="flex items-center gap-1">
                <TimeInput
                  ariaLabel={T.fixedTimeAria(index + 1)}
                  value={time}
                  onChange={(next) => set({ fixedTimes: value.fixedTimes.map((item, i) => (i === index ? next : item)) })}
                />
                <Button
                  type="button"
                  variant="icon"
                  size="icon"
                  aria-label={T.removeFixedTimeAria}
                  onClick={() => set({ fixedTimes: value.fixedTimes.filter((_, i) => i !== index) })}
                >
                  <X className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-xl"
              onClick={() => set({ fixedTimes: [...value.fixedTimes, "12:00"] })}
            >
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              {T.addFixedTime}
            </Button>
          </div>
        </ScheduleField>
      )}
    </div>
  );
}

export function ScheduleField({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <span className="block text-xs font-medium uppercase tracking-wide text-text-sec">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-text-sec">{hint}</span> : null}
    </div>
  );
}

export function TimeInput({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Имя поля для экранного диктора: подпись над полем с ним не связана. */
  ariaLabel?: string;
}) {
  return (
    <Input
      type="time"
      aria-label={ariaLabel}
      step={300}
      value={value}
      onChange={(event) => event.target.value && onChange(event.target.value)}
      className="h-11 rounded-xl px-3 text-sm"
    />
  );
}
