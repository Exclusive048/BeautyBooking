"use client";

import { useEffect, useRef, useState } from "react";
import { UI_TEXT } from "@/lib/ui/text";

type FilterChipsProps = {
  availableToday: boolean;
  rating45plus: boolean;
  entityType: "all" | "master" | "studio";
  priceMin: string;
  priceMax: string;
  onToggleAvailableToday: () => void;
  onToggleRating45plus: () => void;
  onEntityTypeChange: (value: "all" | "master" | "studio") => void;
  onPriceApply: (nextMin: string, nextMax: string) => void;
  onPriceReset: () => void;
};

function chipClassName(active: boolean): string {
  return active
    ? "rounded-full border border-foreground bg-foreground px-4 py-2 text-sm text-background"
    : "rounded-full border border-border bg-card/80 px-4 py-2 text-sm text-foreground hover:bg-card";
}

export function FilterChips({
  availableToday,
  rating45plus,
  entityType,
  priceMin,
  priceMax,
  onToggleAvailableToday,
  onToggleRating45plus,
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

  return (
    <div ref={rootRef} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setDraftMin(priceMin);
            setDraftMax(priceMax);
            setPriceOpen((prev) => !prev);
          }}
          className={chipClassName(priceActive)}
        >
          {UI_TEXT.catalog.chips.price}
        </button>
        {priceOpen ? (
          <div className="absolute left-0 z-30 mt-2 w-56 rounded-xl border border-border bg-card p-3 shadow-md">
            <div className="grid grid-cols-2 gap-2">
              <input
                value={draftMin}
                onChange={(event) => setDraftMin(event.target.value.replace(/[^0-9]/g, ""))}
                placeholder={UI_TEXT.catalog.chips.priceMinPlaceholder}
                className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
                inputMode="numeric"
              />
              <input
                value={draftMax}
                onChange={(event) => setDraftMax(event.target.value.replace(/[^0-9]/g, ""))}
                placeholder={UI_TEXT.catalog.chips.priceMaxPlaceholder}
                className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
                inputMode="numeric"
              />
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  onPriceApply(draftMin, draftMax);
                  setPriceOpen(false);
                }}
                className="flex-1 rounded-lg bg-foreground px-3 py-2 text-sm text-background"
              >
                {UI_TEXT.catalog.chips.apply}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraftMin("");
                  setDraftMax("");
                  onPriceReset();
                  setPriceOpen(false);
                }}
                className="flex-1 rounded-lg border border-border px-3 py-2 text-sm text-foreground"
              >
                {UI_TEXT.catalog.chips.reset}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <button type="button" onClick={onToggleAvailableToday} className={chipClassName(availableToday)}>
        {UI_TEXT.catalog.chips.availableToday}
      </button>
      <button type="button" onClick={onToggleRating45plus} className={chipClassName(rating45plus)}>
        {UI_TEXT.catalog.chips.rating45plus}
      </button>
      <button
        type="button"
        onClick={() => onEntityTypeChange(entityType === "studio" ? "all" : "studio")}
        className={chipClassName(entityType === "studio")}
      >
        {UI_TEXT.catalog.chips.studios}
      </button>
      <button
        type="button"
        onClick={() => onEntityTypeChange(entityType === "master" ? "all" : "master")}
        className={chipClassName(entityType === "master")}
      >
        {UI_TEXT.catalog.chips.privateMasters}
      </button>
    </div>
  );
}
