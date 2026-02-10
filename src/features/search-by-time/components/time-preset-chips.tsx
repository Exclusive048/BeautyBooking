"use client";

import { Chip } from "@/components/ui/chip";
import { UI_TEXT } from "@/lib/ui/text";

export type TimePreset = "morning" | "day" | "evening" | "custom";

type Props = {
  value: TimePreset | null;
  onChange: (value: TimePreset | null) => void;
};

export function TimePresetChips({ value, onChange }: Props) {
  const presets: Array<{ value: TimePreset; label: string }> = [
    { value: "morning", label: UI_TEXT.catalog.timeSearch.morning },
    { value: "day", label: UI_TEXT.catalog.timeSearch.day },
    { value: "evening", label: UI_TEXT.catalog.timeSearch.evening },
    { value: "custom", label: UI_TEXT.catalog.timeSearch.custom },
  ];

  return (
    <div className="flex flex-wrap gap-1 rounded-xl border border-border-subtle bg-bg-card/70 p-1 md:flex-nowrap">
      {presets.map((preset) => (
        <Chip
          key={preset.value}
          type="button"
          onClick={() => onChange(value === preset.value ? null : preset.value)}
          variant={value === preset.value ? "active" : "default"}
          className="flex min-h-[40px] flex-1 basis-[calc(50%-0.25rem)] items-center justify-center rounded-lg px-3 py-2 text-sm md:basis-0"
        >
          {preset.label}
        </Chip>
      ))}
    </div>
  );
}
