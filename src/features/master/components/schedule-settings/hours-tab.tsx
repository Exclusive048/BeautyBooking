"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import {
  SLOT_STEP_OPTIONS,
  type DayScheduleDto,
  type ScheduleEditorSnapshot,
  type SlotStepMin,
} from "@/lib/schedule/editor-shared";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";
import { useSaveStatus } from "./save-status-provider";
import { useAutoSave } from "./use-auto-save";
import { WeekPreview } from "./week-preview";
import { WeekdayRow } from "./weekday-row";

const T = UI_TEXT.cabinetMaster.scheduleSettings;

type Draft = {
  weekSchedule: DayScheduleDto[];
  slotStepMin: SlotStepMin;
};

type Props = {
  initialSnapshot: ScheduleEditorSnapshot;
};

/**
 * Hours tab — edits week schedule + slot step + global schedule mode.
 * Single client component owning the draft, auto-saving on debounce.
 *
 * Mode toggle (FLEXIBLE / FIXED) is currently a global hint that flips
 * every workday's `scheduleMode`; per-day fine control belongs to a future
 * iteration. Slot step is a top-level Provider field.
 *
 * Multiple intervals per day are NOT supported by the backend — the
 * "split day" use-case is solved by adding a break in the middle.
 */
export function HoursTab({ initialSnapshot }: Props) {
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

  useAutoSave({
    value: draft,
    baseline,
    save: async (value) => {
      const response = await fetch("/api/cabinet/master/schedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekSchedule: value.weekSchedule,
          slotStepMin: value.slotStepMin,
        }),
      });
      const json = (await response.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!response.ok || !json || !json.ok) {
        const message =
          json && !json.ok ? json.error.message : T.errors.save;
        return { ok: false, message };
      }
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
        day.dayOfWeek === next.dayOfWeek ? next : day
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

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_22rem]">
      <div className="space-y-6">
        <Section title={T.mode.sectionTitle}>
          <ModeToggle value={globalMode} onChange={setMode} />
        </Section>

        <Section title={T.slotStep.sectionTitle} hint={T.slotStep.hint}>
          <SlotStepSelector value={draft.slotStepMin} onChange={setSlotStep} />
        </Section>

        <Section title={T.week.sectionTitle} hint={T.week.hint}>
          <div className="space-y-2">
            {draft.weekSchedule.map((day) => (
              <WeekdayRow key={day.dayOfWeek} day={day} onChange={updateDay} />
            ))}
          </div>
        </Section>
      </div>

      <div className="xl:sticky xl:top-[calc(var(--topbar-h)+5rem)] xl:self-start">
        <WeekPreview weekSchedule={draft.weekSchedule} />
      </div>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <header className="mb-3">
        <h2 className="font-display text-lg text-text-main">{title}</h2>
        {hint ? <p className="mt-1 text-sm text-text-sec">{hint}</p> : null}
      </header>
      {children}
    </section>
  );
}

function ModeToggle({
  value,
  onChange,
}: {
  value: "FLEXIBLE" | "FIXED";
  onChange: (next: "FLEXIBLE" | "FIXED") => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <ModeCard
        active={value === "FLEXIBLE"}
        title={T.mode.flexibleLabel}
        hint={T.mode.flexibleHint}
        onClick={() => onChange("FLEXIBLE")}
      />
      <ModeCard
        active={value === "FIXED"}
        title={T.mode.fixedLabel}
        hint={T.mode.fixedHint}
        onClick={() => onChange("FIXED")}
      />
    </div>
  );
}

function ModeCard({
  active,
  title,
  hint,
  onClick,
}: {
  active: boolean;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-2xl border p-4 text-left transition-colors",
        active
          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
          : "border-border-subtle bg-bg-card hover:border-primary/40"
      )}
    >
      <div className="font-medium text-text-main">{title}</div>
      <div className="mt-1 text-xs text-text-sec">{hint}</div>
    </button>
  );
}

function SlotStepSelector({
  value,
  onChange,
}: {
  value: SlotStepMin;
  onChange: (next: SlotStepMin) => void;
}) {
  return (
    <div className="inline-flex rounded-2xl border border-border-subtle bg-bg-input p-1">
      {SLOT_STEP_OPTIONS.map((option) => {
        const active = option === value;
        const label = T.slotStep.options[String(option) as keyof typeof T.slotStep.options];
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={cn(
              "rounded-xl px-3.5 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-bg-card text-text-main shadow-card"
                : "text-text-sec hover:text-text-main"
            )}
            aria-pressed={active}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function clampSlotStep(value: number): SlotStepMin {
  return (SLOT_STEP_OPTIONS as readonly number[]).includes(value)
    ? (value as SlotStepMin)
    : 15;
}
