"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Switch } from "@/components/ui/switch";
import { ChipGroup } from "@/components/ui/chip-group";
import { DayHoursEditor, ScheduleField } from "@/features/master/components/schedule-settings/plan/day-hours-editor";
import {
  DEFAULT_DAY_HOURS,
  validateDayHours,
  type DayHoursDraft,
} from "@/features/master/components/schedule-settings/plan/lib/day-hours";
import { WEEKDAY_SHORT, weekdayIndex } from "@/features/master/components/schedule-settings/plan/lib/describe-plan";
import { schedulePatternEndpoint } from "@/features/master/components/schedule-settings/schedule-endpoint-context";
import { fetchJson, serverMessageOr } from "@/lib/http/client";
import { addDaysToDateKey } from "@/lib/schedule/dateKey";
import { CYCLE_PRESETS } from "@/lib/schedule/patterns-shared";
import * as UI_TEXT from "@/lib/ui/text";
import { cn } from "@/lib/cn";
import { buildTeamRhythmRequests, teamRhythmCoverage } from "../lib/team-rhythm";

const T = UI_TEXT.studioCabinet.scheduleTeam.rhythm;
const HOURS_T = UI_TEXT.cabinetMaster.scheduleSettings.wizard.hours;
const DAYS_T = UI_TEXT.cabinetMaster.scheduleSettings.wizard.days;

type MasterOption = { id: string; name: string };

type Props = {
  open: boolean;
  onClose: () => void;
  masters: MasterOption[];
  todayKey: string;
  lastKey: string;
  /** `/api/cabinet/master/schedule?studioId=…&masterId=…` для мастера. */
  endpointFor: (masterId: string) => string;
  onApplied: () => void;
};

/**
 * SCHEDULE-PATTERNS-01 (этап 4) — «График по очереди»: один график «N через
 * M» нескольким мастерам со сдвигом. Пишется тем же окном по мастеру
 * (`PUT …/schedule/pattern`), по очереди; отказ по одному мастеру остальных
 * не отменяет и называется по имени.
 */
export function TeamRhythmModal({ open, onClose, masters, todayKey, lastKey, endpointFor, onApplied }: Props) {
  // Никого не отмечаем заранее: одно нажатие «Применить» переписало бы
  // графики всей команды (найдено живой проверкой 2026-09-28).
  const [selected, setSelected] = useState<string[]>([]);
  const [preset, setPreset] = useState<string>("2x2");
  const [firstDay, setFirstDay] = useState(todayKey);
  const [staggered, setStaggered] = useState(true);
  const [hours, setHours] = useState<DayHoursDraft>({ ...DEFAULT_DAY_HOURS });
  const [autoExtend, setAutoExtend] = useState(false);
  const [endsOn, setEndsOn] = useState(lastKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const found = CYCLE_PRESETS.find((item) => item.id === preset) ?? CYCLE_PRESETS[0]!;
  const ordered = masters.filter((master) => selected.includes(master.id));
  const input = {
    masterIds: ordered.map((master) => master.id),
    work: found.work,
    off: found.off,
    firstDay,
    staggered,
    hours,
    endsOn: autoExtend ? null : endsOn,
  };
  const hoursError = validateDayHours(hours);
  const coverage = ordered.length > 0 ? teamRhythmCoverage(input, 14) : [];
  const canApply = ordered.length > 0 && !hoursError && !busy;

  const apply = async () => {
    setBusy(true);
    setError(null);
    for (const { masterId, request } of buildTeamRhythmRequests(input)) {
      try {
        await fetchJson(schedulePatternEndpoint(endpointFor(masterId)), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        });
      } catch (caught) {
        const name = masters.find((master) => master.id === masterId)?.name ?? "";
        setError(serverMessageOr(caught, T.failed(name)));
        setBusy(false);
        onApplied();
        return;
      }
    }
    setBusy(false);
    onApplied();
    onClose();
  };

  return (
    <ModalSurface
      open={open}
      onClose={onClose}
      header={{ title: T.title, subtitle: T.hint }}
      size="lg"
      stickyFooter
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="primary" size="md" className="rounded-xl" onClick={apply} disabled={!canApply}>
            {busy ? T.applying : T.apply}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <ScheduleField label={T.mastersLabel}>
          <div className="space-y-2">
            {masters.map((master) => (
              <label key={master.id} className="flex min-h-11 items-center gap-3 text-sm text-text-main">
                <Checkbox
                  checked={selected.includes(master.id)}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setSelected((prev) =>
                      checked ? [...prev, master.id] : prev.filter((id) => id !== master.id),
                    );
                  }}
                />
                {master.name}
              </label>
            ))}
          </div>
        </ScheduleField>

        <ScheduleField label={T.presetLabel}>
          <ChipGroup<string>
            value={preset}
            onChange={setPreset}
            options={CYCLE_PRESETS.map((item) => ({ value: item.id, label: DAYS_T.cyclePreset(item.work, item.off) }))}
          />
        </ScheduleField>

        <ScheduleField label={T.firstDayLabel}>
          <Input
            type="date"
            min={todayKey}
            max={lastKey}
            value={firstDay}
            onChange={(event) => event.target.value && setFirstDay(event.target.value)}
            className="h-11 rounded-xl px-3 text-sm"
          />
        </ScheduleField>

        <label className="flex items-start justify-between gap-4 rounded-2xl border border-border-subtle bg-bg-card px-4 py-3">
          <span>
            <span className="block text-sm font-medium text-text-main">{T.staggerLabel}</span>
            <span className="block text-xs text-text-sec">{T.staggerHint}</span>
          </span>
          <Switch checked={staggered} onCheckedChange={setStaggered} aria-label={T.staggerLabel} />
        </label>

        <DayHoursEditor value={hours} onChange={setHours} />
        {hoursError ? (
          <p className="text-sm text-text-sec">{hoursError === "noFixedTimes" ? HOURS_T.noFixedTimes : HOURS_T.invalidRange}</p>
        ) : null}

        <label className="flex items-start justify-between gap-4 rounded-2xl border border-border-subtle bg-bg-card px-4 py-3">
          <span className="block text-sm font-medium text-text-main">{T.autoExtendLabel}</span>
          <Switch checked={autoExtend} onCheckedChange={setAutoExtend} aria-label={T.autoExtendLabel} />
        </label>
        {!autoExtend ? (
          <ScheduleField label={T.endLabel}>
            <Input
              type="date"
              min={firstDay}
              max={lastKey}
              value={endsOn}
              onChange={(event) => event.target.value && setEndsOn(event.target.value)}
              className="h-11 rounded-xl px-3 text-sm"
            />
          </ScheduleField>
        ) : null}

        {coverage.length > 0 ? (
          <ScheduleField label={T.coveragePreview}>
            <div className="grid grid-cols-7 gap-1.5">
              {coverage.map((count, offset) => {
                const dateKey = addDaysToDateKey(firstDay, offset);
                return (
                  <div
                    key={dateKey}
                    className={cn(
                      "flex flex-col items-center rounded-lg border py-1.5 text-xs",
                      count === 0
                        ? "border-warning-border bg-warning-surface text-warning-text"
                        : "border-border-subtle bg-bg-card text-text-main",
                    )}
                  >
                    <span>{WEEKDAY_SHORT[weekdayIndex(dateKey)]}</span>
                    <span className="font-medium">{Number(dateKey.slice(8, 10))}</span>
                    <span className="text-[11px]">{count}</span>
                  </div>
                );
              })}
            </div>
          </ScheduleField>
        ) : (
          <p className="text-sm text-text-sec">{T.noMasters}</p>
        )}

        {error ? <p className="text-sm text-danger-text">{error}</p> : null}
      </div>
    </ModalSurface>
  );
}
