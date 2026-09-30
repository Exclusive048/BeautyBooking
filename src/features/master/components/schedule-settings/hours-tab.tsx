"use client";

import { useMemo, useState } from "react";
import { Clock, Grid3x3, Info } from "lucide-react";
import {
  SLOT_STEP_OPTIONS,
  type DayScheduleDto,
  type ScheduleEditorSnapshot,
  type SlotStepMin,
} from "@/lib/schedule/editor-shared";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";
import { ChipGroup } from "@/components/ui/chip-group";
import { ModeCard } from "@/components/ui/mode-card";
import { SettingRow } from "./components/setting-row";
import { WeeklyDaysList } from "./hours/weekly-days-list";
import { WeekdayStrip } from "./hours/weekday-strip";
import {
  clearDay as clearDayPure,
  copyDayToAll,
  copyDayToWorkdays,
} from "./hours/lib/day-copy";
import { useSaveStatus } from "./save-status-provider";
import { useAutoSave } from "./use-auto-save";
import { useIsStudioProfileSchedule, useScheduleEndpoint } from "./schedule-endpoint-context";
import { WeekPreview } from "./week-preview";
import { summarizePattern } from "./plan/lib/describe-plan";
import { WeekdayRow } from "./weekday-row";

const T = UI_TEXT.cabinetMaster.scheduleSettings;

type Draft = {
  weekSchedule: DayScheduleDto[];
  slotStepMin: SlotStepMin;
};

type Props = {
  initialSnapshot: ScheduleEditorSnapshot;
  /** SCHEDULE-PATTERNS-01: свежий снапшот после сохранения — для карточки графика. */
  onSnapshot?: (snapshot: ScheduleEditorSnapshot) => void;
};

/**
 * Hours tab — edits week schedule + slot step + global schedule mode.
 *
 * schedule-hours-redesign: now built from the shared cabinet
 * primitives (`<ModeCard>`, `<SettingRow>`, `<ChipGroup>`) plus a
 * new compact `<WeeklyDaysList>` container — each weekday becomes
 * a single dense row rather than its own card. Per-day action menu
 * adds copy-to-workdays / copy-to-all / clear-day shortcuts.
 *
 * Mode toggle (FLEXIBLE / FIXED) remains a **global hint** that
 * flips every workday's `scheduleMode` — per-day fine control is on
 * the backlog (the database supports it via
 * `WeeklyScheduleDay.scheduleMode`, the UI doesn't yet). Slot step
 * is a top-level Provider field. Multiple intervals per day are NOT
 * supported by the backend — the "split day" use-case is solved by
 * adding a break in the middle.
 */
export function HoursTab({ initialSnapshot, onSnapshot }: Props) {
  // PWA-FIX-12 — какой день правим на мобильном. Только представление: в
  // черновике и в запросе по-прежнему вся неделя, поэтому «копировать на будни»
  // и автосохранение работают как раньше. 0 = понедельник.
  const [activeDayOfWeek, setActiveDayOfWeek] = useState(0);
  const studioProfile = useIsStudioProfileSchedule();
  const [draft, setDraft] = useState<Draft>(() => ({
    weekSchedule: initialSnapshot.weekSchedule,
    slotStepMin: clampSlotStep(initialSnapshot.slotStepMin),
  }));
  const [baseline, setBaseline] = useState<Draft>(() => ({
    weekSchedule: initialSnapshot.weekSchedule,
    slotStepMin: clampSlotStep(initialSnapshot.slotStepMin),
  }));

  const { setStatus, setErrorMessage } = useSaveStatus();

  const globalMode = useMemo<"FLEXIBLE" | "FIXED">(() => {
    const workday = draft.weekSchedule.find((day) => day.isWorkday);
    return workday?.scheduleMode ?? "FLEXIBLE";
  }, [draft.weekSchedule]);

  // STUDIO-MASTER-PROFILES: личное расписание или профиля в студии.
  const endpoint = useScheduleEndpoint();
  useAutoSave({
    value: draft,
    baseline,
    save: async (value) => {
      let data: unknown;
      try {
        data = await fetchJsonWithAuth<unknown>(endpoint, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            weekSchedule: value.weekSchedule,
            slotStepMin: value.slotStepMin,
          }),
        });
      } catch (error) {
        return { ok: false, message: serverMessageOr(error, T.errors.save) };
      }
      onSnapshot?.(data as ScheduleEditorSnapshot);
      return { ok: true };
    },
    setStatus,
    setErrorMessage,
    onSaved: (value) => setBaseline(value),
  });

  const updateDay = (next: DayScheduleDto) => {
    setDraft((prev) => ({
      ...prev,
      weekSchedule: prev.weekSchedule.map((day) =>
        day.dayOfWeek === next.dayOfWeek ? next : day,
      ),
    }));
  };

  const setMode = (mode: "FLEXIBLE" | "FIXED") => {
    setDraft((prev) => ({
      ...prev,
      weekSchedule: prev.weekSchedule.map((day) => ({ ...day, scheduleMode: mode })),
    }));
  };

  const setSlotStep = (step: SlotStepMin) => {
    setDraft((prev) => ({ ...prev, slotStepMin: step }));
  };

  const handleCopyToWorkdays = (sourceDayOfWeek: number) => {
    setDraft((prev) => ({
      ...prev,
      weekSchedule: copyDayToWorkdays(prev.weekSchedule, sourceDayOfWeek),
    }));
  };

  const handleCopyToAll = (sourceDayOfWeek: number) => {
    setDraft((prev) => ({
      ...prev,
      weekSchedule: copyDayToAll(prev.weekSchedule, sourceDayOfWeek),
    }));
  };

  const handleClearDay = (targetDayOfWeek: number) => {
    setDraft((prev) => ({
      ...prev,
      weekSchedule: clearDayPure(prev.weekSchedule, targetDayOfWeek),
    }));
  };

  // SCHEDULE-PATTERNS-01: сегодня действует не недельный график (2 через 2,
  // чередование недель) — неделей его не выразить, поэтому редактор недели
  // скрыт, а менять график нужно через «Настроить график».
  const plan = initialSnapshot.schedulePlan;
  if (plan.current && plan.current.kind !== "WEEK") {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-border-subtle bg-bg-card px-4">
          <SettingRow
            title={T.slotStep.sectionTitle}
            subtitle={T.slotStep.hint}
            control={
              <ChipGroup<SlotStepMin>
                value={draft.slotStepMin}
                onChange={setSlotStep}
                options={SLOT_STEP_OPTIONS.map((option) => ({
                  value: option,
                  label: T.slotStep.options[String(option) as keyof typeof T.slotStep.options],
                }))}
              />
            }
          />
        </div>
        <div className="flex items-start gap-2 rounded-2xl border border-border-subtle bg-bg-input/30 px-4 py-3 text-sm text-text-sec">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            {T.plan.weekEditorHidden(
              summarizePattern(plan.current, plan.templates),
              studioProfile ? T.plan.proposeCta : T.plan.setupCta,
            )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_22rem]">
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ModeCard
            active={globalMode === "FLEXIBLE"}
            icon={Clock}
            title={T.mode.flexibleLabel}
            description={T.mode.flexibleHint}
            onClick={() => setMode("FLEXIBLE")}
          />
          <ModeCard
            active={globalMode === "FIXED"}
            icon={Grid3x3}
            title={T.mode.fixedLabel}
            description={T.mode.fixedHint}
            onClick={() => setMode("FIXED")}
          />
        </div>

        <div className="rounded-2xl border border-border-subtle bg-bg-card px-4">
          <SettingRow
            title={T.slotStep.sectionTitle}
            subtitle={T.slotStep.hint}
            control={
              <ChipGroup<SlotStepMin>
                value={draft.slotStepMin}
                onChange={setSlotStep}
                options={SLOT_STEP_OPTIONS.map((option) => ({
                  value: option,
                  label: T.slotStep.options[String(option) as keyof typeof T.slotStep.options],
                }))}
              />
            }
          />
        </div>

        {/* PWA-FIX-12 — на телефоне неделя горизонтальная: полоса дней выбирает,
            какой день правим, и под ней ОДНА строка редактора. Семь строк
            `<WeekdayRow>` (каждая — `flex flex-wrap`, то есть на 375px две-три
            линии) давали ~600px вертикали, хотя правится всегда один день. С
            `lg` — прежний список всех семи: там они видны сразу, и сравнение
            дней полезнее экономии высоты. Обе ветви рендерят один и тот же
            `<WeekdayRow>` с одними обработчиками — скрытая ветвь выключена
            `display:none`, поэтому в дерево доступности её поля не попадают. */}
        <div className="lg:hidden">
          <WeeklyDaysList
            strip={
              <WeekdayStrip
                days={draft.weekSchedule}
                activeDayOfWeek={activeDayOfWeek}
                onSelect={setActiveDayOfWeek}
              />
            }
          >
            {draft.weekSchedule
              .filter((day) => day.dayOfWeek === activeDayOfWeek)
              .map((day) => (
                <WeekdayRow
                  key={day.dayOfWeek}
                  day={day}
                  onChange={updateDay}
                  onCopyToWorkdays={() => handleCopyToWorkdays(day.dayOfWeek)}
                  onCopyToAll={() => handleCopyToAll(day.dayOfWeek)}
                  onClear={() => handleClearDay(day.dayOfWeek)}
                />
              ))}
          </WeeklyDaysList>
        </div>

        <div className="hidden lg:block">
          <WeeklyDaysList>
            {draft.weekSchedule.map((day) => (
              <WeekdayRow
                key={day.dayOfWeek}
                day={day}
                onChange={updateDay}
                onCopyToWorkdays={() => handleCopyToWorkdays(day.dayOfWeek)}
                onCopyToAll={() => handleCopyToAll(day.dayOfWeek)}
                onClear={() => handleClearDay(day.dayOfWeek)}
              />
            ))}
          </WeeklyDaysList>
        </div>

        <div className="flex items-start gap-2 rounded-2xl border border-border-subtle bg-bg-input/30 px-4 py-3 text-xs text-text-sec">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <p>{T.week.footerDisclaimer}</p>
        </div>
      </div>

      <div className="xl:sticky xl:top-[calc(var(--topbar-h)+5rem)] xl:self-start">
        <WeekPreview weekSchedule={draft.weekSchedule} />
      </div>
    </div>
  );
}

function clampSlotStep(value: number): SlotStepMin {
  return (SLOT_STEP_OPTIONS as readonly number[]).includes(value)
    ? (value as SlotStepMin)
    : 15;
}
