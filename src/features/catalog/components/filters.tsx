"use client";

import { useMemo } from "react";
import type { ProviderCardModel } from "../types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";

export type CatalogFiltersState = {
  query: string; 
  category: string;
  district: string;
  priceMin: string;
  priceMax: string;
  onlyAvailableToday: boolean;
};

export function CatalogFilters({
  providers,
  value,
  onChange,
  onReset,
}: {
  providers: ProviderCardModel[];
  value: CatalogFiltersState;
  onChange: (next: CatalogFiltersState) => void;
  onReset: () => void;
}) {
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of providers) p.categories.forEach((c) => set.add(c));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ru"));
  }, [providers]);

  const districts = useMemo(() => {
    const set = new Set<string>();
    for (const p of providers) set.add(p.district);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ru"));
  }, [providers]);

  const hasAnyFilter =
    value.category ||
    value.district ||
    value.priceMin ||
    value.priceMax ||
    value.onlyAvailableToday;

  return (
    <Card className="bg-white">
      <CardContent className="p-5 md:p-6 space-y-5">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-neutral-900">Фильтры</div>
          <Button
            variant="secondary"
            size="sm"
            onClick={onReset}
            disabled={!hasAnyFilter}
          >
            Сбросить
          </Button>
          <div className="space-y-2">
            <div className="text-xs font-semibold text-neutral-500">Поиск</div>
            <Input
              placeholder="Мастер, студия, услуга..."
              value={value.query}
              onChange={(e) => onChange({ ...value, query: e.target.value })}
            />
            <div className="text-[11px] text-neutral-500">
              Ищем по названию, описанию и категориям.
            </div>
          </div>
        </div>

        {/* toggle */}
        <label
          className={cn(
            "flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-neutral-200 p-3 transition",
            value.onlyAvailableToday ? "bg-neutral-50" : "bg-white hover:bg-neutral-50"
          )}
        >
          <div className="min-w-0">
            <div className="text-sm font-medium text-neutral-900">Свободно сегодня</div>
            <div className="mt-0.5 text-xs text-neutral-500">Пока мок-флаг, позже по слотам</div>
          </div>

          <input
            type="checkbox"
            className="h-5 w-5 accent-black"
            checked={value.onlyAvailableToday}
            onChange={(e) =>
              onChange({ ...value, onlyAvailableToday: e.target.checked })
            }
          />
        </label>

        {/* category */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-neutral-500">Категория</div>
          <select
            value={value.category}
            onChange={(e) => onChange({ ...value, category: e.target.value })}
            className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-neutral-900"
          >
            <option value="">Любая</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* district */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-neutral-500">Район</div>
          <select
            value={value.district}
            onChange={(e) => onChange({ ...value, district: e.target.value })}
            className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-neutral-900"
          >
            <option value="">Любой</option>
            {districts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        {/* price */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-neutral-500">Цена</div>

          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="От"
              value={value.priceMin}
              onChange={(e) =>
                onChange({ ...value, priceMin: e.target.value })
              }
            />
            <Input
              placeholder="До"
              value={value.priceMax}
              onChange={(e) =>
                onChange({ ...value, priceMax: e.target.value })
              }
            />
          </div>

          <div className="text-[11px] text-neutral-500">
            В MVP фильтруем по <span className="font-medium">priceFrom</span>.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
