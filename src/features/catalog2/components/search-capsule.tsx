"use client";

import { UI_TEXT } from "@/lib/ui/text";

type SearchCapsuleProps = {
  serviceQuery: string;
  district: string;
  date: string;
  onServiceQueryChange: (value: string) => void;
  onDistrictChange: (value: string) => void;
  onDateChange: (value: string) => void;
  onSubmit: () => void;
};

export function SearchCapsule({
  serviceQuery,
  district,
  date,
  onServiceQueryChange,
  onDistrictChange,
  onDateChange,
  onSubmit,
}: SearchCapsuleProps) {
  return (
    <div className="rounded-full border border-border bg-card/90 p-2 shadow-sm">
      <div className="grid gap-2 md:grid-cols-[1.2fr_1fr_0.9fr_auto] md:items-center">
        <input
          value={serviceQuery}
          onChange={(event) => onServiceQueryChange(event.target.value)}
          placeholder={UI_TEXT.catalog.capsule.servicePlaceholder}
          className="h-10 rounded-full border border-border bg-background px-4 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
          aria-label={UI_TEXT.catalog.capsule.servicePlaceholder}
        />
        <input
          value={district}
          onChange={(event) => onDistrictChange(event.target.value)}
          placeholder={UI_TEXT.catalog.capsule.districtPlaceholder}
          className="h-10 rounded-full border border-border bg-background px-4 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
          aria-label={UI_TEXT.catalog.capsule.districtPlaceholder}
        />
        <input
          value={date}
          onChange={(event) => onDateChange(event.target.value)}
          type="date"
          className="h-10 rounded-full border border-border bg-background px-4 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
          aria-label={UI_TEXT.catalog.capsule.datePlaceholder}
        />
        <button
          type="button"
          onClick={onSubmit}
          className="h-10 rounded-full bg-foreground px-5 text-sm font-medium text-background transition hover:opacity-90"
        >
          {UI_TEXT.catalog.capsule.find}
        </button>
      </div>
    </div>
  );
}
