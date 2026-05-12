"use client";

import { Camera, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePresetChips } from "@/features/catalog/components/date-preset-chips";
import {
  ServiceSearchInput,
  type AutocompleteCategory,
} from "@/features/catalog/components/service-search-input";
import {
  TimePresetChips,
  type TimePreset,
} from "@/features/search-by-time/components/time-preset-chips";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  serviceQuery: string;
  date: string;
  timePreset: TimePreset | null;
  timeFrom: string;
  timeTo: string;
  citySlug?: string | null;
  onServiceQueryChange: (value: string) => void;
  onCategorySelectFromSearch: (category: AutocompleteCategory) => void;
  onDateChange: (value: string) => void;
  onTimePresetChange: (
    preset: Exclude<TimePreset, "custom">,
    timeFrom: string,
    timeTo: string,
  ) => void;
  onCustomTimeChange: (timeFrom: string, timeTo: string) => void;
  onClearTime: () => void;
  onSubmit: () => void;
  showPhotoSearch?: boolean;
  onOpenPhotoSearch?: () => void;
};

const T = UI_TEXT.catalog2.searchBar;

/**
 * Premium two-row search composition for /catalog. A single rounded card
 * holds (1) service-query input + photo + Найти, divided by a hairline from
 * (2) the «Когда» row with date and time presets. The card hover-lifts via
 * shadow so it reads as one cohesive surface, not three loose controls.
 */
export function CatalogSearchBar({
  serviceQuery,
  date,
  timePreset,
  timeFrom,
  timeTo,
  citySlug,
  onServiceQueryChange,
  onCategorySelectFromSearch,
  onDateChange,
  onTimePresetChange,
  onCustomTimeChange,
  onClearTime,
  onSubmit,
  showPhotoSearch = false,
  onOpenPhotoSearch,
}: Props) {
  return (
    <div className="overflow-visible rounded-2xl border border-border-subtle bg-bg-card shadow-sm transition-shadow duration-200 hover:shadow-md">
      {/* Row 1 — service search + photo + submit. The input is transparent
          because the card already supplies the surface; nesting another
          bordered input would read as "card-in-card". */}
      <div className="flex items-center gap-2 p-3">
        <ServiceSearchInput
          value={serviceQuery}
          onChange={onServiceQueryChange}
          onCategorySelect={onCategorySelectFromSearch}
          onSubmit={onSubmit}
          citySlug={citySlug}
          className="flex-1"
        />

        {showPhotoSearch && onOpenPhotoSearch ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-xl text-text-sec hover:bg-bg-input/70 hover:text-text-main"
            aria-label={UI_TEXT.home.visualSearch.button}
            title={UI_TEXT.home.visualSearch.button}
            onClick={onOpenPhotoSearch}
          >
            <Camera className="h-4 w-4" aria-hidden />
          </Button>
        ) : null}

        <Button
          type="button"
          variant="primary"
          size="lg"
          className="h-11 shrink-0 rounded-xl px-5"
          onClick={onSubmit}
        >
          <Search className="mr-2 h-4 w-4" aria-hidden />
          {T.findCta}
        </Button>
      </div>

      {/* Hairline divider — opacity 50% so it reads as a soft segment break
          instead of a hard rule. */}
      <div className="border-t border-border-subtle/50" aria-hidden />

      {/* Row 2 — «Когда» eyebrow + date chips + vertical separator + time chips.
          flex-wrap so the inline custom-range time inputs (rendered by
          TimePresetChips when the user picks "Свой диапазон") fall onto a
          new line on narrow viewports rather than overflowing. */}
      <div className="flex flex-wrap items-center gap-3 p-3">
        <span className="shrink-0 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-text-sec">
          {T.whenLabel}
        </span>
        <DatePresetChips value={date} onChange={onDateChange} />
        <div className="mx-1 h-6 w-px bg-border-subtle" aria-hidden />
        <TimePresetChips
          value={timePreset}
          timeFrom={timeFrom}
          timeTo={timeTo}
          onChange={(next) => {
            // Top-level chip click without payload — only matters for
            // deselect, where the inner `onClear` already fires.
            if (next === null) onClearTime();
          }}
          onPresetSelect={onTimePresetChange}
          onCustomTimeChange={onCustomTimeChange}
          onClear={onClearTime}
        />
      </div>
    </div>
  );
}
