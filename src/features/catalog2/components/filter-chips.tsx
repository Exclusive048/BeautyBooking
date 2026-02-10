"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { UI_TEXT } from "@/lib/ui/text";

// AUDIT (section 6 UI):
// - Smart preset chips are implemented and map to review-tag intents.
type FilterChipsProps = {
  availableToday: boolean;
  rating45plus: boolean;
  hot: boolean;
  smartTag: "rush" | "relax" | "design" | "safe" | "silent" | null;
  entityType: "all" | "master" | "studio";
  priceMin: string;
  priceMax: string;
  onToggleAvailableToday: () => void;
  onToggleRating45plus: () => void;
  onToggleHot: () => void;
  onSmartTagChange: (value: "rush" | "relax" | "design" | "safe" | "silent" | null) => void;
  onEntityTypeChange: (value: "all" | "master" | "studio") => void;
  onPriceApply: (nextMin: string, nextMax: string) => void;
  onPriceReset: () => void;
};

export function FilterChips({
  availableToday,
  rating45plus,
  hot,
  smartTag,
  entityType,
  priceMin,
  priceMax,
  onToggleAvailableToday,
  onToggleRating45plus,
  onToggleHot,
  onSmartTagChange,
  onEntityTypeChange,
  onPriceApply,
  onPriceReset,
}: FilterChipsProps) {
  const [priceOpen, setPriceOpen] = useState(false);
  const [draftMin, setDraftMin] = useState(priceMin);
  const [draftMax, setDraftMax] = useState(priceMax);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!priceOpen) return;

    const onDocumentClick = (event: MouseEvent) => {
      if (!rootRef.current) return;
      const target = event.target;
      if (target instanceof Node && !rootRef.current.contains(target)) {
        setPriceOpen(false);
      }
    };

    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, [priceOpen]);

  const priceActive = priceMin.length > 0 || priceMax.length > 0;
  const smartPresets: Array<{ value: "rush" | "relax" | "design" | "safe" | "silent"; label: string }> = [
    { value: "rush", label: "Спешу" },
    { value: "relax", label: "Хочу расслабиться" },
    { value: "design", label: "Сложный дизайн" },
    { value: "safe", label: "Безопасность" },
    { value: "silent", label: "Комфортно молча" },
  ];

  return (
    <div ref={rootRef} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      <div className="relative">
        <Chip
          type="button"
          onClick={() => {
            setDraftMin(priceMin);
            setDraftMax(priceMax);
            setPriceOpen((prev) => !prev);
          }}
          variant={priceActive ? "active" : "default"}
        >
          {UI_TEXT.catalog.chips.price}
        </Chip>
        {priceOpen ? (
          <div className="absolute left-0 z-30 mt-2 w-56 rounded-2xl border border-border-subtle bg-bg-card p-3 shadow-card">
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={draftMin}
                onChange={(event) => setDraftMin(event.target.value.replace(/[^0-9]/g, ""))}
                placeholder={UI_TEXT.catalog.chips.priceMinPlaceholder}
                className="h-9 rounded-lg px-3 text-sm"
                inputMode="numeric"
              />
              <Input
                value={draftMax}
                onChange={(event) => setDraftMax(event.target.value.replace(/[^0-9]/g, ""))}
                placeholder={UI_TEXT.catalog.chips.priceMaxPlaceholder}
                className="h-9 rounded-lg px-3 text-sm"
                inputMode="numeric"
              />
            </div>
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                onClick={() => {
                  onPriceApply(draftMin, draftMax);
                  setPriceOpen(false);
                }}
                className="flex-1"
                size="sm"
              >
                {UI_TEXT.catalog.chips.apply}
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setDraftMin("");
                  setDraftMax("");
                  onPriceReset();
                  setPriceOpen(false);
                }}
                className="flex-1"
                size="sm"
                variant="secondary"
              >
                {UI_TEXT.catalog.chips.reset}
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <Chip type="button" onClick={onToggleAvailableToday} variant={availableToday ? "active" : "default"}>
        {UI_TEXT.catalog.chips.availableToday}
      </Chip>
      <Chip type="button" onClick={onToggleRating45plus} variant={rating45plus ? "active" : "default"}>
        {UI_TEXT.catalog.chips.rating45plus}
      </Chip>
      <Chip type="button" onClick={onToggleHot} variant={hot ? "active" : "default"}>
        🔥 {UI_TEXT.catalog.chips.hot}
      </Chip>
      {smartPresets.map((preset) => (
        <Chip
          key={preset.value}
          type="button"
          onClick={() => onSmartTagChange(smartTag === preset.value ? null : preset.value)}
          variant={smartTag === preset.value ? "active" : "default"}
        >
          {preset.label}
        </Chip>
      ))}
      <Chip
        type="button"
        onClick={() => onEntityTypeChange(entityType === "studio" ? "all" : "studio")}
        variant={entityType === "studio" ? "active" : "default"}
      >
        {UI_TEXT.catalog.chips.studios}
      </Chip>
      <Chip
        type="button"
        onClick={() => onEntityTypeChange(entityType === "master" ? "all" : "master")}
        variant={entityType === "master" ? "active" : "default"}
      >
        {UI_TEXT.catalog.chips.privateMasters}
      </Chip>
    </div>
  );
}
