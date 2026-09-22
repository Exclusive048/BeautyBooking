"use client";

import { ArrowUpDown, Check, ChevronDown } from "lucide-react";
import type { CatalogSort } from "@/lib/catalog/schemas";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.catalog2.sort;

const OPTIONS: ReadonlyArray<{ value: CatalogSort; label: string }> = [
  { value: "relevance", label: T.relevance },
  { value: "rating", label: T.rating },
  { value: "price-asc", label: T["price-asc"] },
  { value: "price-desc", label: T["price-desc"] },
  { value: "distance", label: T.distance },
  { value: "popular", label: T.popular },
];

type Props = {
  value: CatalogSort;
  onChange: (next: CatalogSort) => void;
  /**
   * Компактная форма для строки результатов на телефоне: иконка + текущее
   * значение, без слова «Сортировка» — строка результатов должна уместиться
   * в одну линию рядом со счётчиком.
   */
  compact?: boolean;
};

export function SortMenu({ value, onChange, compact = false }: Props) {
  const current = OPTIONS.find((o) => o.value === value) ?? OPTIONS[0];

  return (
    <details className="relative inline-block">
      <summary
        aria-label={compact ? `${T.label}: ${current.label}` : undefined}
        className={cn(
          "inline-flex shrink-0 cursor-pointer list-none items-center gap-2 whitespace-nowrap font-medium transition-colors [&::-webkit-details-marker]:hidden",
          compact
            ? "h-9 rounded-full px-2 text-xs text-text-sec hover:text-text-main"
            : "h-9 rounded-xl border border-border-subtle bg-bg-card px-3 text-sm text-text-main hover:bg-bg-input",
        )}
      >
        {compact ? (
          <ArrowUpDown className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <span className="text-text-sec">{T.label}</span>
        )}
        <span>{current.label}</span>
        <ChevronDown className="h-3.5 w-3.5 text-text-sec" aria-hidden />
      </summary>
      <div className="absolute right-0 top-[calc(100%+6px)] z-20 min-w-56 rounded-xl border border-border-subtle bg-bg-card p-1.5 shadow-card">
        {OPTIONS.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={(e) => {
                onChange(opt.value);
                const detailsEl = e.currentTarget.closest("details");
                if (detailsEl) detailsEl.open = false;
              }}
              className={
                "flex h-9 w-full items-center justify-between rounded-lg px-3 text-left text-sm transition-colors " +
                (active
                  ? "bg-muted/50 text-text-main"
                  : "text-text-main hover:bg-muted/40")
              }
            >
              <span>{opt.label}</span>
              {active ? <Check className="h-3.5 w-3.5 text-accent-text" aria-hidden /> : null}
            </button>
          );
        })}
      </div>
    </details>
  );
}
