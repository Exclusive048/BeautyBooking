"use client";

import { UI_TEXT } from "@/lib/ui/text";

export type CategoryPillId = "all" | "nails" | "hair" | "brows" | "skin";

const T = UI_TEXT.catalog2.categories;

const ITEMS: ReadonlyArray<{ id: CategoryPillId; label: string }> = [
  { id: "all", label: T.all },
  { id: "nails", label: T.nails },
  { id: "hair", label: T.hair },
  { id: "brows", label: T.brows },
  { id: "skin", label: T.skin },
];

type Props = {
  value: CategoryPillId;
  onChange: (next: CategoryPillId) => void;
  /** Optional small label rendered above the pill row to disambiguate from smart-tags below. */
  groupLabel?: string;
};

/**
 * Segmented pill row for top-level service categories — matches the reference
 * design language. Lives next to (not replacing) the existing smart-tag chips:
 * categories answer "what service?", smart-tags answer "what mood?". The
 * `groupLabel` prop lets callers caption the row when the disambiguation
 * helps users — e.g. "Категория" above pills vs "По настроению" above tags.
 */
export function CategoryPills({ value, onChange, groupLabel }: Props) {
  return (
    <div>
      {groupLabel ? (
        <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
          {groupLabel}
        </p>
      ) : null}
      <div
        role="tablist"
        aria-label={UI_TEXT.catalog2.searchBar.categoriesGroupLabel}
        className="inline-flex rounded-full bg-muted/40 p-1"
      >
        {ITEMS.map((item) => {
          const active = item.id === value;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(item.id)}
              className={
                "h-8 rounded-full px-3.5 text-sm font-medium transition-colors " +
                (active
                  ? "bg-bg-card text-text-main shadow-card"
                  : "text-text-sec hover:text-text-main")
              }
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
