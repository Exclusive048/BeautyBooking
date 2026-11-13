"use client";

import { SLOT_STEP_OPTIONS, type BookingRulesDto, type SlotStepMin } from "@/lib/schedule/editor-shared";
import * as UI_TEXT from "@/lib/ui/text";
import { ChipGroup } from "@/components/ui/chip-group";
import { formatDays } from "@/lib/utils/pluralize-days";
import { SettingRow } from "../components/setting-row";

const T = UI_TEXT.cabinetMaster.scheduleSettings.rules.bookingWindow;
const S = UI_TEXT.cabinetMaster.scheduleSettings.slotStep;

const SLOT_STEP_CHIPS = SLOT_STEP_OPTIONS.map((option) => ({
  value: option,
  label: S.options[String(option) as keyof typeof S.options],
}));

const MIN_OPTIONS = [
  { value: 1, label: T.minOptions["1"] },
  { value: 2, label: T.minOptions["2"] },
  { value: 4, label: T.minOptions["4"] },
  { value: 24, label: T.minOptions["24"] },
];

const MAX_PRESETS = [7, 14, 30, 60, 90];

/**
 * BOOKING-WINDOW-MERGE: варианты «Запись открыта вперёд». Значение вне
 * набора (перенесённое из прежнего «Сколько окошек вперёд» — например, 3 дня
 * — или заданное администратором студии) показывается своей кнопкой, иначе
 * ни одна кнопка не была бы выбрана. Единица — у последней кнопки.
 */
function maxDaysOptions(current: number): { value: number; label: string }[] {
  const values = [...new Set([...MAX_PRESETS, current])].sort((a, b) => a - b);
  return values.map((value, index) => ({
    value,
    label: index === values.length - 1 ? formatDays(value) : String(value),
  }));
}

type Props = {
  rules: BookingRulesDto;
  onChange: (next: BookingRulesDto) => void;
  slotStepMin: SlotStepMin;
  onSlotStepChange: (next: SlotStepMin) => void;
};

/**
 * "Когда можно записаться" — pair of chip groups for the booking window.
 * Min hours ahead = how soon a client can grab a slot. Max days ahead =
 * how far in advance the schedule is open — and, since BOOKING-WINDOW-MERGE,
 * how far ahead clients see free slots. Шаг окошек — как часто они
 * начинаются; жил во вкладке «Часы», переехал сюда вместе с её удалением
 * (SCHEDULE-HOURS-TAB-REMOVAL, 2026-10-01): это поле `Provider`, а не недели.
 */
export function BookingWindowSection({ rules, onChange, slotStepMin, onSlotStepChange }: Props) {
  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-card p-5">
      <h2 className="mb-4 font-display text-lg text-text-main">{T.title}</h2>
      <div className="divide-y divide-border-subtle">
        <SettingRow
          title={T.minTitle}
          subtitle={T.minSubtitle}
          control={
            <ChipGroup
              value={rules.minHoursAhead}
              onChange={(value) => onChange({ ...rules, minHoursAhead: value })}
              options={MIN_OPTIONS}
            />
          }
        />
        <SettingRow
          title={T.maxTitle}
          subtitle={T.maxSubtitle}
          control={
            <ChipGroup
              value={rules.maxDaysAhead}
              onChange={(value) => onChange({ ...rules, maxDaysAhead: value })}
              options={maxDaysOptions(rules.maxDaysAhead)}
            />
          }
        />
        <SettingRow
          title={S.sectionTitle}
          subtitle={S.hint}
          control={
            <ChipGroup<SlotStepMin> value={slotStepMin} onChange={onSlotStepChange} options={SLOT_STEP_CHIPS} />
          }
        />
      </div>
    </section>
  );
}
