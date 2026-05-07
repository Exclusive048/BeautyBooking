"use client";

import type { BookingRulesDto } from "@/lib/schedule/editor-shared";
import { UI_TEXT } from "@/lib/ui/text";
import { ChipGroup } from "../components/chip-group";
import { SettingRow } from "../components/setting-row";

const T = UI_TEXT.cabinetMaster.scheduleSettings.rules.bookingWindow;

const MIN_OPTIONS = [
  { value: 1, label: T.minOptions["1"] },
  { value: 2, label: T.minOptions["2"] },
  { value: 4, label: T.minOptions["4"] },
  { value: 24, label: T.minOptions["24"] },
];

const MAX_OPTIONS = [
  { value: 14, label: T.maxOptions["14"] },
  { value: 30, label: T.maxOptions["30"] },
  { value: 60, label: T.maxOptions["60"] },
  { value: 90, label: T.maxOptions["90"] },
];

type Props = {
  rules: BookingRulesDto;
  onChange: (next: BookingRulesDto) => void;
};

/**
 * "Когда можно записаться" — pair of chip groups for the booking window.
 * Min hours ahead = how soon a client can grab a slot. Max days ahead =
 * how far in advance the schedule is open.
 */
export function BookingWindowSection({ rules, onChange }: Props) {
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
              options={MAX_OPTIONS}
            />
          }
        />
      </div>
    </section>
  );
}
