"use client";

import { useCallback, useMemo, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { DistrictSuggestInput } from "@/features/catalog/components/district-suggest-input";
import { HistogramSlider } from "@/features/catalog/components/histogram-slider";
import { WhenFilter, type WhenTimePreset } from "@/features/catalog/components/when-filter";
import { useTopCategories, type CatalogCategory } from "@/features/catalog/lib/use-top-categories";
import { useDeferredCommit } from "@/hooks/use-deferred-commit";
import type { CatalogPriceBucket } from "@/lib/catalog/catalog.service";
import { UI_TEXT } from "@/lib/ui/text";

type Category = CatalogCategory;

export type CatalogFilters = {
  globalCategoryId: string | null;
  district: string;
  ratingMin: string;
  priceMin: string;
  priceMax: string;
  hot: boolean;
  entityType: "all" | "master" | "studio";
  availableToday: boolean;
  /** CATALOG-DATE-TIME-FILTER: «когда» — день и часы салона. */
  when: { date: string; timePreset: WhenTimePreset | null; timeFrom: string; timeTo: string };
  onWhenChange: (updates: Record<string, string | null>) => void;
};

type Props = CatalogFilters & {
  onGlobalCategoryChange: (value: string | null) => void;
  onDistrictChange: (value: string) => void;
  onRatingMinChange: (value: string) => void;
  onPriceChange: (min: string, max: string) => void;
  onToggleHot: () => void;
  onEntityTypeChange: (value: "all" | "master" | "studio") => void;
  onToggleAvailableToday: () => void;
  onReset: () => void;
  activeCount: number;
  showHeader?: boolean;
  /** Server-supplied price distribution for the histogram backdrop. When undefined or empty, the slider falls back to a flat track. */
  priceDistribution?: ReadonlyArray<CatalogPriceBucket>;
};

const PRICE_FALLBACK_MIN = 0;
const PRICE_FALLBACK_MAX = 20000;
const CATEGORIES_VISIBLE_BY_DEFAULT = 10;

const RATING_STEPS = [0, 3, 3.5, 4, 4.5, 5];

/**
 * CATALOG-FILTER-DEBOUNCE (2026-08-31) — ползунки цены и рейтинга шлют `change`
 * на КАЖДЫЙ пиксель перетаскивания, а фильтр живёт в URL: каждое событие было
 * навигацией + запросом `/api/catalog/search`. Черновик рисуется мгновенно, а
 * в URL (и в запрос) значение уходит после `FILTER_COMMIT_DELAY_MS` тишины —
 * см. `useDeferredCommit`. Кнопки/переключатели дебаунса не требуют: это
 * дискретные клики, у них одно событие = одно намерение.
 */
const FILTER_COMMIT_DELAY_MS = 300;
const priceRangeEqual = (a: [number, number], b: [number, number]) =>
  a[0] === b[0] && a[1] === b[1];

type CategoriesSectionProps = {
  topCategories: Category[];
  globalCategoryId: string | null;
  onGlobalCategoryChange: (value: string | null) => void;
  sectionClass: string;
  labelClass: string;
};

function CategoriesSection({
  topCategories,
  globalCategoryId,
  onGlobalCategoryChange,
  sectionClass,
  labelClass,
}: CategoriesSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded
    ? topCategories
    : topCategories.slice(0, CATEGORIES_VISIBLE_BY_DEFAULT);
  const hasMore = topCategories.length > CATEGORIES_VISIBLE_BY_DEFAULT;

  return (
    <section className={sectionClass}>
      <div className={labelClass}>{UI_TEXT.catalog.sidebar.categories}</div>
      <div className="space-y-1">
        {visible.map((cat) => {
          const active = globalCategoryId === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onGlobalCategoryChange(active ? null : cat.id)}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                active
                  ? "bg-primary/10 font-medium text-accent-text"
                  : "text-text-main hover:bg-bg-input/70"
              }`}
            >
              {cat.icon ? <span aria-hidden>{cat.icon}</span> : null}
              <span>{cat.title}</span>
            </button>
          );
        })}
      </div>
      {hasMore ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 px-3 text-xs font-medium text-accent-text hover:underline"
        >
          {expanded
            ? UI_TEXT.catalog2.filters.categoriesCollapse
            : UI_TEXT.catalog2.filters.categoriesShowAll.replace(
                "{count}",
                String(topCategories.length),
              )}
        </button>
      ) : null}
    </section>
  );
}

export function CatalogSidebar({
  globalCategoryId,
  district,
  ratingMin,
  priceMin,
  priceMax,
  hot,
  entityType,
  availableToday,
  when,
  onWhenChange,
  onGlobalCategoryChange,
  onDistrictChange,
  onRatingMinChange,
  onPriceChange,
  onToggleHot,
  onEntityTypeChange,
  onToggleAvailableToday,
  onReset,
  activeCount,
  showHeader = true,
  priceDistribution,
}: Props) {
  const topCategories = useTopCategories();

  // Slider domain — derived from server-supplied distribution when present,
  // otherwise a sensible 0..20k fallback so the widget is interactive even
  // before the first result-set comes in.
  const sliderMin = priceDistribution && priceDistribution.length > 0
    ? priceDistribution[0]!.from
    : PRICE_FALLBACK_MIN;
  const sliderMax = priceDistribution && priceDistribution.length > 0
    ? priceDistribution[priceDistribution.length - 1]!.to
    : PRICE_FALLBACK_MAX;

  const parsedLow = priceMin ? Math.max(sliderMin, Number(priceMin) || sliderMin) : sliderMin;
  const parsedHigh = priceMax ? Math.min(sliderMax, Number(priceMax) || sliderMax) : sliderMax;

  // Цена: черновик — сразу на ползунке, в URL — через FILTER_COMMIT_DELAY_MS.
  const committedPrice = useMemo<[number, number]>(
    () => [parsedLow, parsedHigh],
    [parsedLow, parsedHigh],
  );
  const commitPrice = useCallback(
    ([nextLow, nextHigh]: [number, number]) => {
      const minStr = nextLow > sliderMin ? String(Math.round(nextLow)) : "";
      const maxStr = nextHigh < sliderMax ? String(Math.round(nextHigh)) : "";
      onPriceChange(minStr, maxStr);
    },
    [onPriceChange, sliderMin, sliderMax],
  );
  const [priceValue, setPriceValue] = useDeferredCommit(
    committedPrice,
    commitPrice,
    FILTER_COMMIT_DELAY_MS,
    priceRangeEqual,
  );

  const ratingValue = parseFloat(ratingMin) || 0;

  // Рейтинг: тот же приём, что у цены, — ползунок и подпись «N+» ходят за
  // черновиком, URL догоняет через FILTER_COMMIT_DELAY_MS.
  const commitRating = useCallback(
    (next: number) => onRatingMinChange(next === 0 ? "" : String(next)),
    [onRatingMinChange],
  );
  const [ratingDraft, setRatingDraft] = useDeferredCommit(
    ratingValue,
    commitRating,
    FILTER_COMMIT_DELAY_MS,
  );

  // All sections share the same shell: a font-mono uppercase eyebrow title,
  // 24px bottom padding, and a 1px subtle bottom border (suppressed on the
  // last child so the column doesn't end with a hairline). Keeps the column
  // visually quiet so the actual filter controls draw the eye.
  const sectionClass = "pb-6 border-b border-border-subtle last:border-b-0 last:pb-0";
  const labelClass =
    "mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-text-sec";

  return (
    <div className="space-y-6">
      {showHeader ? (
        <div className="flex items-center justify-between pb-2">
          <h2 className="font-display text-lg text-text-main">
            {UI_TEXT.catalog.sidebar.title}
          </h2>
          {activeCount > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onReset}
              className="h-7 px-2 text-xs text-text-sec hover:text-text-main"
            >
              {UI_TEXT.catalog.sidebar.reset}
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* CATALOG-DATE-TIME-FILTER: «Когда» — первым: чаще всего клиент ищет
          время, а не категорию. */}
      <section className={sectionClass}>
        <div className={labelClass}>{UI_TEXT.catalog2.searchBar.whenLabel}</div>
        <WhenFilter
          date={when.date}
          timePreset={when.timePreset}
          timeFrom={when.timeFrom}
          timeTo={when.timeTo}
          onChange={onWhenChange}
        />
      </section>

      {/* Categories — single-radio top-level. Backend expansion (see
          resolveCategoryFilterIds) automatically pulls in children, so a pick
          of "Маникюр и педикюр" returns providers tagged manicure / pedicure
          too. Collapsed to 10 by default; the toggle only renders when there
          are more — currently 6 are seeded, so the button is future-proofing
          for catalog growth. */}
      {topCategories.length > 0 ? (
        <CategoriesSection
          topCategories={topCategories}
          globalCategoryId={globalCategoryId}
          onGlobalCategoryChange={onGlobalCategoryChange}
          sectionClass={sectionClass}
          labelClass={labelClass}
        />
      ) : null}

      <section className={sectionClass}>
        <div className={labelClass}>{UI_TEXT.catalog.chips.price}</div>
        <HistogramSlider
          min={sliderMin}
          max={sliderMax}
          value={priceValue}
          distribution={priceDistribution ?? []}
          onChange={setPriceValue}
        />
      </section>

      <section className={sectionClass}>
        <div className="mb-3 flex items-center justify-between">
          <div className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-text-sec">
            {UI_TEXT.catalog.sidebar.rating}
          </div>
          <span className="font-mono text-sm tabular-nums text-text-main">
            {ratingDraft === 0 ? UI_TEXT.catalog.sidebar.ratingAny : `${ratingDraft}+`}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={5}
          step={0.5}
          value={ratingDraft}
          onChange={(e) => setRatingDraft(parseFloat(e.target.value))}
          className="h-2 w-full cursor-pointer accent-primary"
          aria-label={UI_TEXT.catalog.sidebar.rating}
        />
        <div className="mt-1 flex justify-between text-[10px] text-text-sec">
          {RATING_STEPS.map((step) => (
            <span key={step}>{step === 0 ? UI_TEXT.catalog.sidebar.ratingAny : step}</span>
          ))}
        </div>
      </section>

      <section className={sectionClass}>
        <div className={labelClass}>{UI_TEXT.catalog.sidebar.district}</div>
        <DistrictSuggestInput value={district} onChange={onDistrictChange} />
      </section>

      <section className={sectionClass}>
        <div className={labelClass}>{UI_TEXT.catalog.sidebar.entityType}</div>
        <div className="flex gap-2">
          {(["all", "master", "studio"] as const).map((type) => (
            <Chip
              key={type}
              type="button"
              variant={entityType === type ? "active" : "default"}
              onClick={() => onEntityTypeChange(type)}
            >
              {type === "all"
                ? UI_TEXT.catalog.sidebar.entityAll
                : type === "master"
                  ? UI_TEXT.catalog.sidebar.entityMaster
                  : UI_TEXT.catalog.sidebar.entityStudio}
            </Chip>
          ))}
        </div>
      </section>

      <section className={sectionClass}>
        <div className={labelClass}>{UI_TEXT.catalog2.filters.additional}</div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-main">{UI_TEXT.catalog.sidebar.hot}</span>
            <Switch checked={hot} onCheckedChange={onToggleHot} size="sm" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-main">
              {UI_TEXT.catalog.sidebar.availableToday}
            </span>
            <Switch
              checked={availableToday}
              onCheckedChange={onToggleAvailableToday}
              size="sm"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
