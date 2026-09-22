"use client";

import type { ReactNode } from "react";
import { Flame, Star, X } from "lucide-react";
import { ChipButton } from "@/components/ui/chip-button";
import { useTopCategories } from "@/features/catalog/lib/use-top-categories";
import { moneyRUBFromKopeks } from "@/lib/format";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.catalog2.quickFilters;

/** Порог, который ставит чип рейтинга, когда рейтинг ещё не выбран. */
const QUICK_RATING = "4.5";

type Props = {
  availableToday: boolean;
  hot: boolean;
  ratingMin: string;
  entityType: "all" | "master" | "studio";
  globalCategoryId: string | null;
  /** Копейки — в URL цена лежит в тех же единицах, что и у ползунка. */
  priceMin: string;
  priceMax: string;
  district: string;
  /** Обновления параметров URL; `null` удаляет параметр. */
  onChange: (updates: Record<string, string | null>) => void;
};

function formatPrice(kopeks: string): string {
  return moneyRUBFromKopeks(Number(kopeks) || 0);
}

function priceLabel(min: string, max: string): string {
  if (min && max) return T.priceRange(formatPrice(min), formatPrice(max));
  if (max) return T.priceUpTo(formatPrice(max));
  return T.priceFrom(formatPrice(min));
}

/**
 * Быстрые фильтры каталога — одна горизонтальная полоса под строкой поиска.
 *
 * Паттерн топовых приложений записи и маркетплейсов: то, что нажимают чаще
 * всего, — чип в один тап, всё остальное — в панели «Фильтры». Фильтры,
 * выставленные в панели и не имеющие собственного чипа (цена, район),
 * всплывают здесь же съёмными чипами с крестиком — иначе про них можно
 * узнать, только открыв панель. Активная категория встаёт первой, чтобы
 * выбранная из автодополнения не терялась за кромкой полосы.
 *
 * Скроллер и дорожка — разные элементы (FIX-D2, `horizontal-strip.test.ts`).
 */
export function CatalogQuickFilters({
  availableToday,
  hot,
  ratingMin,
  entityType,
  globalCategoryId,
  priceMin,
  priceMax,
  district,
  onChange,
}: Props) {
  const categories = useTopCategories();
  const orderedCategories = globalCategoryId
    ? [
        ...categories.filter((c) => c.id === globalCategoryId),
        ...categories.filter((c) => c.id !== globalCategoryId),
      ]
    : categories;

  const priceActive = priceMin.length > 0 || priceMax.length > 0;
  const ratingActive = ratingMin.length > 0;

  return (
    <div
      role="group"
      aria-label={T.ariaLabel}
      className="-mx-4 overflow-x-auto px-4 scroll-px-4 scrollbar-hide sm:-mx-6 sm:px-6"
    >
      <div className="flex min-w-max items-center gap-2 py-0.5">
        {priceActive ? (
          <RemovableChip
            label={priceLabel(priceMin, priceMax)}
            onRemove={() => onChange({ priceMin: null, priceMax: null })}
          />
        ) : null}
        {district ? (
          <RemovableChip label={district} onRemove={() => onChange({ district: null })} />
        ) : null}

        <ChipButton
          active={availableToday}
          onClick={() =>
            // `date=<сегодня>` — прежняя форма того же фильтра (ссылки со
            // старого блока «Когда»); снимаем обе, иначе чип не выключится.
            onChange(availableToday ? { availableToday: null, date: null } : { availableToday: "true" })
          }
        >
          {T.availableToday}
        </ChipButton>

        <ChipButton active={hot} onClick={() => onChange({ hot: hot ? null : "true" })}>
          <Flame className="-ml-0.5 mr-1 h-3.5 w-3.5" aria-hidden />
          {T.hot}
        </ChipButton>

        <ChipButton
          active={ratingActive}
          onClick={() => onChange({ ratingMin: ratingActive ? null : QUICK_RATING })}
        >
          <Star className="-ml-0.5 mr-1 h-3.5 w-3.5" aria-hidden />
          {T.ratingFrom(ratingActive ? ratingMin : QUICK_RATING)}
        </ChipButton>

        {orderedCategories.map((category) => {
          const active = category.id === globalCategoryId;
          return (
            <ChipButton
              key={category.id}
              active={active}
              onClick={() => onChange({ globalCategoryId: active ? null : category.id })}
            >
              {category.title}
            </ChipButton>
          );
        })}

        <ChipButton
          active={entityType === "master"}
          onClick={() => onChange({ entityType: entityType === "master" ? null : "master" })}
        >
          {T.masters}
        </ChipButton>
        <ChipButton
          active={entityType === "studio"}
          onClick={() => onChange({ entityType: entityType === "studio" ? null : "studio" })}
        >
          {T.studios}
        </ChipButton>
      </div>
    </div>
  );
}

function RemovableChip({ label, onRemove }: { label: ReactNode; onRemove: () => void }) {
  return (
    <ChipButton
      active
      onClick={onRemove}
      // Это кнопка «убрать», а не переключатель: состояние «нажат» ей не нужно.
      aria-pressed={undefined}
      aria-label={typeof label === "string" ? T.removeAria(label) : undefined}
      className="pr-2.5"
    >
      <span className="max-w-[10rem] truncate">{label}</span>
      <X className="ml-1 h-3.5 w-3.5 shrink-0" aria-hidden />
    </ChipButton>
  );
}
