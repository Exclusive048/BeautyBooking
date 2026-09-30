"use client";

import { useState } from "react";
import { Check, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalSurface } from "@/components/ui/modal-surface";
import { fetchJson, serverMessageOr } from "@/lib/http/client";
import {
  PALETTE_LABEL_MAX,
  SCHEDULE_DAY_COLOR_KEYS,
  type ScheduleDayColorKey,
} from "@/lib/schedule/calendar-shared";
import type { ScheduleEditorSnapshot } from "@/lib/schedule/editor-shared";
import type { DayTemplateDto } from "@/lib/schedule/patterns-shared";
import * as UI_TEXT from "@/lib/ui/text";
import { cn } from "@/lib/cn";
import { DayHoursEditor, ScheduleField } from "../plan/day-hours-editor";
import { scheduleSubEndpoint } from "../schedule-endpoint-context";
import { DEFAULT_DAY_HOURS, dayHoursToTemplate, validateDayHours, type DayHoursDraft } from "../plan/lib/day-hours";
import { DAY_COLOR_FILL } from "./lib/calendar-grid";
import { templateHoursLabel } from "./lib/template-label";

const T = UI_TEXT.cabinetMaster.scheduleSettings.calendar.palette;
const HOURS_T = UI_TEXT.cabinetMaster.scheduleSettings.wizard.hours;

type View = { kind: "list" } | { kind: "create" } | { kind: "edit"; templateId: string };

type Props = {
  open: boolean;
  onClose: () => void;
  templates: DayTemplateDto[];
  /** `…/schedule/palette` с параметрами профиля. */
  paletteEndpoint: string;
  /** Сразу открыть создание (кнопка «Рабочий день» у кистей). */
  startWithCreate?: boolean;
  onSnapshot: (snapshot: ScheduleEditorSnapshot) => void;
  /** Создан новый рабочий день — календарь делает его кистью. */
  onCreated?: (templateId: string) => void;
};

/**
 * SCHEDULE-PATTERNS-01 (этап 3) — палитра рабочих дней: список, создание,
 * имя и цвет. Часы у существующего дня не меняются (на него опираются
 * прошедшие дни) — для других часов создаётся новый день.
 */
export function PaletteModal({
  open,
  onClose,
  templates,
  paletteEndpoint,
  startWithCreate = false,
  onSnapshot,
  onCreated,
}: Props) {
  const [view, setView] = useState<View>(startWithCreate ? { kind: "create" } : { kind: "list" });
  const palette = templates.filter((item) => item.inPalette);
  const editing = view.kind === "edit" ? templates.find((item) => item.id === view.templateId) ?? null : null;

  return (
    <ModalSurface
      open={open}
      onClose={onClose}
      header={{
        title: view.kind === "create" ? T.createTitle : view.kind === "edit" ? T.editTitle : T.title,
        subtitle: view.kind === "list" ? T.hint : undefined,
      }}
      size="md"
    >
      {view.kind === "list" ? (
        <div className="space-y-3">
          {palette.length === 0 ? <p className="text-sm text-text-sec">{T.empty}</p> : null}
          <ul className="divide-y divide-border-subtle overflow-hidden rounded-2xl border border-border-subtle">
            {palette.map((template) => (
              <li key={template.id}>
                <Button
                  type="button"
                  variant="wrapper"
                  size="none"
                  onClick={() => setView({ kind: "edit", templateId: template.id })}
                  className="flex w-full items-center gap-3 bg-bg-card px-4 py-3 text-left hover:bg-bg-input"
                >
                  <span aria-hidden className={cn("h-6 w-6 shrink-0 rounded-full", DAY_COLOR_FILL[template.color])} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-text-main">
                      {template.name ?? templateHoursLabel(template)}
                    </span>
                    {template.name ? (
                      <span className="block text-xs text-text-sec">{templateHoursLabel(template)}</span>
                    ) : null}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-text-sec" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
          <Button type="button" variant="secondary" size="md" className="rounded-xl" onClick={() => setView({ kind: "create" })}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden />
            {UI_TEXT.cabinetMaster.scheduleSettings.calendar.addDayCta}
          </Button>
        </div>
      ) : view.kind === "create" ? (
        <PaletteDayForm
          key="create"
          mode="create"
          template={null}
          defaultColor={SCHEDULE_DAY_COLOR_KEYS[palette.length % SCHEDULE_DAY_COLOR_KEYS.length]!}
          paletteEndpoint={paletteEndpoint}
          onBack={startWithCreate ? onClose : () => setView({ kind: "list" })}
          onDone={(snapshot, templateId) => {
            onSnapshot(snapshot);
            if (templateId) onCreated?.(templateId);
            if (startWithCreate) onClose();
            else setView({ kind: "list" });
          }}
        />
      ) : editing ? (
        <PaletteDayForm
          key={editing.id}
          mode="edit"
          template={editing}
          defaultColor={editing.color}
          paletteEndpoint={paletteEndpoint}
          onBack={() => setView({ kind: "list" })}
          onDone={(snapshot) => {
            onSnapshot(snapshot);
            setView({ kind: "list" });
          }}
        />
      ) : null}
    </ModalSurface>
  );
}

function PaletteDayForm({
  mode,
  template,
  defaultColor,
  paletteEndpoint,
  onBack,
  onDone,
}: {
  mode: "create" | "edit";
  template: DayTemplateDto | null;
  defaultColor: ScheduleDayColorKey;
  paletteEndpoint: string;
  onBack: () => void;
  onDone: (snapshot: ScheduleEditorSnapshot, templateId?: string) => void;
}) {
  const [label, setLabel] = useState(template?.name ?? "");
  const [color, setColor] = useState<ScheduleDayColorKey>(defaultColor);
  const [hours, setHours] = useState<DayHoursDraft>({ ...DEFAULT_DAY_HOURS });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hoursError = mode === "create" ? validateDayHours(hours) : null;
  const canSave = label.trim().length > 0 && !hoursError && !busy;
  const itemEndpoint = template
    ? scheduleSubEndpoint(paletteEndpoint, `/${encodeURIComponent(template.id)}`)
    : paletteEndpoint;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === "create") {
        const data = await fetchJson<{ templateId: string; snapshot: ScheduleEditorSnapshot }>(paletteEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: label.trim(), color, ...dayHoursToTemplate(hours) }),
        });
        onDone(data.snapshot, data.templateId);
      } else {
        const data = await fetchJson<{ snapshot: ScheduleEditorSnapshot }>(itemEndpoint, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: label.trim(), color }),
        });
        onDone(data.snapshot);
      }
    } catch (caught) {
      setError(serverMessageOr(caught, T.saveError));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await fetchJson<{ snapshot: ScheduleEditorSnapshot }>(itemEndpoint, { method: "DELETE" });
      onDone(data.snapshot);
    } catch (caught) {
      setError(serverMessageOr(caught, T.deleteError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <ScheduleField label={T.labelField}>
        <Input
          value={label}
          maxLength={PALETTE_LABEL_MAX}
          placeholder={T.labelPlaceholder}
          onChange={(event) => setLabel(event.target.value)}
          className="h-11 rounded-xl px-3 text-sm"
        />
      </ScheduleField>

      <ScheduleField label={T.colorField}>
        <div className="flex flex-wrap gap-2">
          {SCHEDULE_DAY_COLOR_KEYS.map((key, index) => (
            <Button
              key={key}
              type="button"
              variant="wrapper"
              size="none"
              aria-label={T.colorAria(index + 1)}
              aria-pressed={color === key}
              onClick={() => setColor(key)}
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-full border-2",
                DAY_COLOR_FILL[key],
                color === key ? "border-primary" : "border-transparent",
              )}
            >
              {color === key ? <Check className="h-4 w-4 text-text-main" aria-hidden /> : null}
            </Button>
          ))}
        </div>
      </ScheduleField>

      {mode === "create" ? (
        <>
          <DayHoursEditor value={hours} onChange={setHours} />
          {hoursError ? (
            <p className="text-sm text-text-sec">
              {hoursError === "noFixedTimes" ? HOURS_T.noFixedTimes : HOURS_T.invalidRange}
            </p>
          ) : null}
        </>
      ) : template ? (
        <div className="space-y-1 rounded-2xl border border-border-subtle bg-bg-card px-4 py-3">
          <p className="text-sm font-medium text-text-main">{templateHoursLabel(template)}</p>
          <p className="text-xs text-text-sec">{T.hoursReadonly}</p>
        </div>
      ) : null}

      {mode === "edit" && template?.inUse ? <p className="text-xs text-text-sec">{T.inUseHint}</p> : null}
      {error ? <p className="text-sm text-danger-text">{error}</p> : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="secondary" size="md" className="rounded-xl" onClick={onBack} disabled={busy}>
          {UI_TEXT.cabinetMaster.scheduleSettings.wizard.back}
        </Button>
        <div className="flex items-center gap-2">
          {mode === "edit" ? (
            <Button
              type="button"
              variant="danger"
              size="md"
              className="rounded-xl"
              onClick={remove}
              disabled={busy || Boolean(template?.inUse)}
            >
              {T.delete}
            </Button>
          ) : null}
          <Button type="button" variant="primary" size="md" className="rounded-xl" onClick={save} disabled={!canSave}>
            {mode === "create" ? T.create : T.save}
          </Button>
        </div>
      </div>
    </div>
  );
}
