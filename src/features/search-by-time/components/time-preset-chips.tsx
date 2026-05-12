"use client";

import { ChipButton } from "@/components/ui/chip-button";
import { Input } from "@/components/ui/input";
import { UI_TEXT } from "@/lib/ui/text";

export type TimePreset = "morning" | "day" | "evening" | "custom";

const PRESET_RANGES: Record<Exclude<TimePreset, "custom">, { from: string; to: string }> = {
  morning: { from: "09:00", to: "12:00" },
  day: { from: "12:00", to: "18:00" },
  evening: { from: "18:00", to: "22:00" },
};

const CUSTOM_DEFAULT_FROM = "09:00";
const CUSTOM_DEFAULT_TO = "12:00";

type Props = {
  value: TimePreset | null;
  /** Current custom range — only consulted when `value === "custom"`. */
  timeFrom?: string;
  timeTo?: string;
  onChange: (value: TimePreset | null) => void;
  onPresetSelect?: (preset: Exclude<TimePreset, "custom">, from: string, to: string) => void;
  onCustomTimeChange?: (from: string, to: string) => void;
  onClear?: () => void;
};

/**
 * Time-of-day preset chips: Утро / День / Вечер / Свой диапазон. When the
 * user picks "Свой диапазон" two `<input type="time">` controls render
 * inline (flex-wrap) so the orchestrator doesn't need a separate component
 * for the custom range — see fix-2 plan, point #4.
 */
export function TimePresetChips({
  value,
  timeFrom = "",
  timeTo = "",
  onChange,
  onPresetSelect,
  onCustomTimeChange,
  onClear,
}: Props) {
  const presets: Array<{ value: Exclude<TimePreset, "custom">; label: string }> = [
    { value: "morning", label: UI_TEXT.catalog.timeSearch.morning },
    { value: "day", label: UI_TEXT.catalog.timeSearch.day },
    { value: "evening", label: UI_TEXT.catalog.timeSearch.evening },
  ];

  const handlePresetClick = (preset: Exclude<TimePreset, "custom">) => {
    if (value === preset) {
      onClear?.();
      onChange(null);
      return;
    }
    const range = PRESET_RANGES[preset];
    onPresetSelect?.(preset, range.from, range.to);
    onChange(preset);
  };

  const handleCustomClick = () => {
    if (value === "custom") {
      onClear?.();
      onChange(null);
      return;
    }
    const nextFrom = timeFrom || CUSTOM_DEFAULT_FROM;
    const nextTo = timeTo || CUSTOM_DEFAULT_TO;
    onCustomTimeChange?.(nextFrom, nextTo);
    onChange("custom");
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {presets.map((preset) => (
        <ChipButton
          key={preset.value}
          active={value === preset.value}
          onClick={() => handlePresetClick(preset.value)}
        >
          {preset.label}
        </ChipButton>
      ))}

      <ChipButton active={value === "custom"} onClick={handleCustomClick}>
        {UI_TEXT.catalog.timeSearch.custom}
      </ChipButton>

      {value === "custom" ? (
        <div className="flex items-center gap-2">
          <label className="text-xs text-text-sec">
            {UI_TEXT.catalog.timeSearch.from}
          </label>
          <Input
            type="time"
            step={900}
            value={timeFrom}
            onChange={(event) => onCustomTimeChange?.(event.target.value, timeTo)}
            className="h-8 w-auto rounded-full bg-bg-input/90 text-xs"
          />
          <label className="text-xs text-text-sec">
            {UI_TEXT.catalog.timeSearch.to}
          </label>
          <Input
            type="time"
            step={900}
            value={timeTo}
            onChange={(event) => onCustomTimeChange?.(timeFrom, event.target.value)}
            className="h-8 w-auto rounded-full bg-bg-input/90 text-xs"
          />
        </div>
      ) : null}
    </div>
  );
}
