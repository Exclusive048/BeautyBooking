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
 * @deprecated Removed from /catalog in 22a-fix-1 — categories now live
 * exclusively in the sidebar (single-radio top-level + backend expansion).
 * Kept here for potential future surfaces (homepage hero, focused-category
 * landings). Delete the component if no usage appears within the next sprint.
 *
 * Segmented pill row for top-level service categories — matches the reference
 * design language. The `groupLabel` prop captions the row when disambiguation
 * helps users.
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
        aria-label={groupLabel}
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
