"use client";

import type { BookingRulesDto, LateCancelAction } from "@/lib/schedule/editor-shared";
import { UI_TEXT } from "@/lib/ui/text";
import { ChipGroup } from "../components/chip-group";
import { SettingRow } from "../components/setting-row";

const T = UI_TEXT.cabinetMaster.scheduleSettings.rules.cancellation;

const FREE_OPTIONS = [
  { value: 1, label: T.freeOptions["1"] },
  { value: 2, label: T.freeOptions["2"] },
  { value: 4, label: T.freeOptions["4"] },
  { value: 12, label: T.freeOptions["12"] },
];

const AFTER_OPTIONS: { value: LateCancelAction; label: string }[] = [
  { value: "none", label: T.afterOptions.none },
  { value: "reminder", label: T.afterOptions.reminder },
  { value: "fine", label: T.afterOptions.fine },
];

type Props = {
  rules: BookingRulesDto;
  onChange: (next: BookingRulesDto) => void;
};

/**
 * "Отмена и перенос" — free-cancel window + late-cancel action.
 *
 * Free-cancel hours map to existing `Provider.cancellationDeadlineHours`
 * (kept the BD name; UI relabels as "Бесплатная отмена"). The "fine"
 * option is persisted but not yet enforced — payment-side fines aren't
 * wired (see editor.ts JSDoc on `lateCancelAction`).
 *
 * The chip group uses `?? 0` to render when the existing value is null;
 * picking any chip writes a real number into the database.
 */
export function CancellationSection({ rules, onChange }: Props) {
  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-card p-5">
      <h2 className="mb-4 font-display text-lg text-text-main">{T.title}</h2>
      <div className="divide-y divide-border-subtle">
        <SettingRow
          title={T.freeTitle}
          subtitle={T.freeSubtitle}
          control={
            <ChipGroup
              value={rules.freeCancelHours ?? 2}
              onChange={(value) => onChange({ ...rules, freeCancelHours: value })}
              options={FREE_OPTIONS}
            />
          }
        />
        <SettingRow
          title={T.afterTitle}
          subtitle={T.afterSubtitle}
          control={
            <ChipGroup
              value={rules.lateCancelAction}
              onChange={(value) => onChange({ ...rules, lateCancelAction: value })}
              options={AFTER_OPTIONS}
            />
          }
        />
      </div>
    </section>
  );
}
