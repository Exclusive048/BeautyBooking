"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FolderOpen, Plus } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";
import * as UI_TEXT from "@/lib/ui/text";
import type { StudioServiceCategoryRow } from "../lib/types";
import { AddCategoryDialog } from "./add-category-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const T = UI_TEXT.studioCabinet.servicesV2.categories;

type Props = {
  /** Kept on the prop interface for the (unused now) page wrapper, but
   * the rewired AddCategoryDialog uses `/api/categories/propose` which
   * is studio-agnostic — see CATEGORY-UNIFICATION-A. */
  studioId?: string;
  categories: StudioServiceCategoryRow[];
  selectedCategoryId: string | null;
};

export function CategoriesSidebar({
  categories,
  selectedCategoryId,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [addOpen, setAddOpen] = useState(false);
  // STUDIO-SERVICES-SORT-A: «Скрыть пустые» toggle. Component-state
  // (not URL or localStorage) — minimal scope, refresh-to-reset is
  // an acceptable UX trade-off for a single discoverable control.
  // Default off — first visit shows every category so the studio
  // admin can see the full taxonomy + which buckets need filling.
  const [hideEmpty, setHideEmpty] = useState(false);

  const select = (id: string) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("category", id);
    next.delete("service");
    router.replace(`?${next.toString()}`, { scroll: false });
  };

  // Backend already returns categories sorted by count desc + alpha
  // (see `buildCategoriesSidebar`). Toggle just filters the list.
  const visibleCategories = useMemo(
    () => (hideEmpty ? categories.filter((c) => c.servicesCount > 0) : categories),
    [categories, hideEmpty],
  );
  // Disable the toggle when no categories exist at all (nothing to
  // hide). Keep it interactive when ≥1 category exists, even if all
  // would be hidden — the empty-state below explains how to act.
  const hasAnyCategory = categories.length > 0;

  return (
    <aside className="space-y-3 rounded-2xl border border-border-subtle bg-bg-card p-4">
      <header className="flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold text-text-main">
          {T.title}
        </h2>
        <Button variant="wrapper"
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-accent-text transition-colors hover:bg-primary/10"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          {T.addCategory}
        </Button>
      </header>

      {hasAnyCategory ? (
        <label className="flex items-center justify-between gap-2 rounded-lg px-1 py-1 text-xs text-text-sec">
          <span className="select-none">{T.hideEmptyLabel}</span>
          <Switch
            size="sm"
            checked={hideEmpty}
            onCheckedChange={setHideEmpty}
            aria-label={T.hideEmptyLabel}
          />
        </label>
      ) : null}

      {categories.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border-subtle p-6 text-center">
          <FolderOpen className="h-6 w-6 text-text-sec/40" aria-hidden />
          <p className="text-xs text-text-sec">{T.empty}</p>
        </div>
      ) : visibleCategories.length === 0 ? (
        // STUDIO-SERVICES-SORT-A: «hide empty» on + every category is
        // empty → actionable hint, not a blank box. Tells the admin
        // what to do (turn off the filter OR add services).
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border-subtle p-6 text-center">
          <FolderOpen className="h-6 w-6 text-text-sec/40" aria-hidden />
          <p className="text-xs text-text-sec">{T.allEmptyHint}</p>
        </div>
      ) : (
        <ul className="space-y-1">
          {visibleCategories.map((category) => {
            const active = category.id === selectedCategoryId;
            return (
              <li key={category.id}>
                <Button variant="wrapper"
                  onClick={() => select(category.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left transition-colors",
                    active
                      ? "bg-primary/10 text-accent-text"
                      : "text-text-main hover:bg-bg-input/60",
                  )}
                  aria-pressed={active}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span className="truncate text-sm font-medium">
                      {category.title}
                    </span>
                    {category.status === "PENDING" ? (
                      <Badge size="xs" variant="warning" className="shrink-0" title={T.pendingHint}>
                        {T.pendingBadge}
                      </Badge>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-3xs font-mono tabular-nums",
                      active
                        ? "bg-primary/20 text-accent-text"
                        : "bg-bg-input text-text-sec",
                    )}
                  >
                    {category.servicesCount}
                  </span>
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <AddCategoryDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </aside>
  );
}
