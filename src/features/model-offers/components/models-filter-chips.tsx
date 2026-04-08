"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";
import type { PublicModelOfferFilterCategory } from "@/lib/model-offers/public.service";

type Props = {
  categories: PublicModelOfferFilterCategory[];
  activeCategoryId: string | undefined;
  city: string | undefined;
};

function buildFilterHref(categoryId: string | undefined, city: string | undefined): string {
  const params = new URLSearchParams();
  if (categoryId) params.set("categoryId", categoryId);
  if (city) params.set("city", city);
  const q = params.toString();
  return q ? `?${q}` : "/models";
}

export function ModelsFilterChips({ categories, activeCategoryId, city }: Props) {
  if (categories.length === 0) return null;

  return (
    <div
      className="relative"
      role="navigation"
      aria-label={UI_TEXT.pages.models.filterChipAriaLabel}
    >
      {/* Fade edge right */}
      <div
        className="pointer-events-none absolute right-0 top-0 z-10 h-full w-12 bg-gradient-to-l from-background to-transparent"
        aria-hidden
      />
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {/* "All" chip */}
        <Link
          href={buildFilterHref(undefined, city)}
          className={cn(
            "inline-flex shrink-0 items-center rounded-full px-4 py-2 text-sm font-medium transition-colors",
            !activeCategoryId
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
          )}
          aria-current={!activeCategoryId ? "true" : undefined}
        >
          {UI_TEXT.pages.models.filterAll}
        </Link>

        {categories.map((cat) => {
          const isActive = activeCategoryId === cat.id;
          return (
            <Link
              key={cat.id}
              href={buildFilterHref(cat.id, city)}
              className={cn(
                "inline-flex shrink-0 items-center rounded-full px-4 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              )}
              aria-current={isActive ? "true" : undefined}
            >
              {cat.name}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
