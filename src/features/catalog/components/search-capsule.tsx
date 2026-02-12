"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    <div className="glass-panel rounded-full p-2">
      <div className="grid gap-2 md:grid-cols-[1.2fr_1fr_0.9fr_auto] md:items-center">
        <Input
          value={serviceQuery}
          onChange={(event) => onServiceQueryChange(event.target.value)}
          placeholder={UI_TEXT.catalog.capsule.servicePlaceholder}
          className="h-10 rounded-full bg-bg-input/90"
          aria-label={UI_TEXT.catalog.capsule.servicePlaceholder}
        />
        <Input
          value={district}
          onChange={(event) => onDistrictChange(event.target.value)}
          placeholder={UI_TEXT.catalog.capsule.districtPlaceholder}
          className="h-10 rounded-full bg-bg-input/90"
          aria-label={UI_TEXT.catalog.capsule.districtPlaceholder}
        />
        <Input
          value={date}
          onChange={(event) => onDateChange(event.target.value)}
          type="date"
          className="h-10 rounded-full bg-bg-input/90"
          aria-label={UI_TEXT.catalog.capsule.datePlaceholder}
        />
        <Button type="button" onClick={onSubmit} className="h-10 rounded-full px-5 text-sm">
          {UI_TEXT.catalog.capsule.find}
        </Button>
      </div>
    </div>
  );
}
