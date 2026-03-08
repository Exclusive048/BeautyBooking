"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { UI_TEXT } from "@/lib/ui/text";
import type { ApiResponse } from "@/lib/types/api";

type FilterChipsProps = {
  availableToday: boolean;
  rating45plus: boolean;
  hot: boolean;
  smartTag?: "rush" | "relax" | "design" | "safe" | "silent" | null;
  entityType: "all" | "master" | "studio";
  globalCategoryId?: string | null;
  priceMin: string;
  priceMax: string;
  onToggleAvailableToday: () => void;
  onToggleRating45plus: () => void;
  onToggleHot: () => void;
  onSmartTagChange?: (value: "rush" | "relax" | "design" | "safe" | "silent" | null) => void;
  onEntityTypeChange: (value: "all" | "master" | "studio") => void;
  onGlobalCategoryChange?: (value: string | null) => void;
  onPriceApply: (nextMin: string, nextMax: string) => void;
  onPriceReset: () => void;
};

type CatalogCategoryChip = {
  id: string;
  title: string;
  icon: string | null;
  parentId: string | null;
  depth?: number;
};

export function FilterChips({
  availableToday,
  rating45plus,
  hot,
  entityType,
  globalCategoryId,
  priceMin,
  priceMax,
  onToggleAvailableToday,
  onToggleRating45plus,
  onToggleHot,
  onEntityTypeChange,
  onGlobalCategoryChange,
  onPriceApply,
  onPriceReset,
}: FilterChipsProps) {
  const [priceOpen, setPriceOpen] = useState(false);
  const [draftMin, setDraftMin] = useState(priceMin);
  const [draftMax, setDraftMax] = useState(priceMax);
  const [categories, setCategories] = useState<CatalogCategoryChip[]>([]);
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/catalog/global-categories?status=APPROVED", { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as
          | ApiResponse<{ categories: CatalogCategoryChip[] }>
          | null;
        if (!res.ok || !json || !json.ok || cancelled) {
          if (!cancelled) setCategories([]);
          return;
        }
        setCategories(json.data.categories);
      } catch {
        if (!cancelled) setCategories([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const topLevelCategories = useMemo(
    () => categories.filter((category) => category.parentId === null && (category.depth ?? 0) === 0),
    [categories]
  );

  const priceActive = priceMin.length > 0 || priceMax.length > 0;

  return (
    <div ref={rootRef} className="flex w-full flex-wrap items-center gap-2">
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
        ?? {UI_TEXT.catalog.chips.hot}
      </Chip>
      {topLevelCategories.map((category) => (
        <Chip
          key={category.id}
          type="button"
          variant={globalCategoryId === category.id ? "active" : "default"}
          onClick={() => onGlobalCategoryChange?.(globalCategoryId === category.id ? null : category.id)}
        >
          {category.icon ? `${category.icon} ` : ""}
          {category.title}
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
