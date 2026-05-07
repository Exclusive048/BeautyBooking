"use client";

import type { SlotPrecision, VisibilityDto } from "@/lib/schedule/editor-shared";
import { UI_TEXT } from "@/lib/ui/text";
import { ChipGroup } from "../components/chip-group";
import { SettingRow } from "../components/setting-row";

const T = UI_TEXT.cabinetMaster.scheduleSettings.visibility.slot;

const PUBLISHED_OPTIONS = [
  { value: true, label: T.publishedOptions.yes },
  { value: false, label: T.publishedOptions.link },
];

const PRECISION_OPTIONS: { value: SlotPrecision; label: string }[] = [
  { value: "exact", label: T.precisionOptions.exact },
  { value: "today_free", label: T.precisionOptions.today_free },
  { value: "date_only", label: T.precisionOptions.date_only },
];

const DAY_OPTIONS = [
  { value: 3, label: T.daysOptions["3"] },
  { value: 7, label: T.daysOptions["7"] },
  { value: 14, label: T.daysOptions["14"] },
  { value: 30, label: T.daysOptions["30"] },
];

type Props = {
  visibility: VisibilityDto;
  onChange: (next: VisibilityDto) => void;
};

/**
 * "Как клиенты видят слоты" — public catalog inclusion + slot precision +
 * visible horizon. `isPublished = false` removes the provider from the
 * catalog (existing public-catalog behaviour).
 */
export function SlotVisibilitySection({ visibility, onChange }: Props) {
  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-card p-5">
      <h2 className="mb-4 font-display text-lg text-text-main">{T.title}</h2>
      <div className="divide-y divide-border-subtle">
        <SettingRow
          title={T.publishedTitle}
          subtitle={T.publishedSubtitle}
          control={
            <ChipGroup
              value={visibility.isPublished}
              onChange={(value) => onChange({ ...visibility, isPublished: value })}
              options={PUBLISHED_OPTIONS}
            />
          }
        />
        <SettingRow
          title={T.precisionTitle}
          subtitle={T.precisionSubtitle}
          control={
            <ChipGroup
              value={visibility.slotPrecision}
              onChange={(value) => onChange({ ...visibility, slotPrecision: value })}
              options={PRECISION_OPTIONS}
            />
          }
        />
        <SettingRow
          title={T.daysTitle}
          subtitle={T.daysSubtitle}
          control={
            <ChipGroup
              value={visibility.visibleSlotDays}
              onChange={(value) => onChange({ ...visibility, visibleSlotDays: value })}
              options={DAY_OPTIONS}
            />
          }
        />
      </div>
    </section>
  );
}
