"use client";

import { Check, ChevronDown } from "lucide-react";
import type { CatalogSort } from "@/lib/catalog/schemas";
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
};

export function SortMenu({ value, onChange }: Props) {
  const current = OPTIONS.find((o) => o.value === value) ?? OPTIONS[0];

  return (
    <details className="relative inline-block">
      <summary className="inline-flex h-9 cursor-pointer list-none items-center gap-2 rounded-xl border border-border-subtle bg-bg-card px-3 text-sm font-medium text-text-main transition-colors hover:bg-bg-input [&::-webkit-details-marker]:hidden">
        <span className="text-text-sec">{T.label}</span>
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
              {active ? <Check className="h-3.5 w-3.5 text-primary" aria-hidden /> : null}
            </button>
          );
        })}
      </div>
    </details>
  );
}
