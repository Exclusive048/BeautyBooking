"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FolderOpen, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";
import type { StudioServiceCategoryRow } from "../lib/types";
import { AddCategoryDialog } from "./add-category-dialog";

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

  const select = (id: string) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("category", id);
    next.delete("service");
    router.replace(`?${next.toString()}`, { scroll: false });
  };

  return (
    <aside className="space-y-3 rounded-2xl border border-border-subtle bg-bg-card p-4">
      <header className="flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold text-text-main">
          {T.title}
        </h2>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          {T.addCategory}
        </button>
      </header>

      {categories.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border-subtle p-6 text-center">
          <FolderOpen className="h-6 w-6 text-text-sec/40" aria-hidden />
          <p className="text-xs text-text-sec">{T.empty}</p>
        </div>
      ) : (
        <ul className="space-y-1">
          {categories.map((category) => {
            const active = category.id === selectedCategoryId;
            return (
              <li key={category.id}>
                <button
                  type="button"
                  onClick={() => select(category.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-text-main hover:bg-bg-input/60",
                  )}
                  aria-pressed={active}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span className="truncate text-sm font-medium">
                      {category.title}
                    </span>
                    {category.status === "PENDING" ? (
                      <span
                        className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-amber-700 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300"
                        title={T.pendingHint}
                      >
                        {T.pendingBadge}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-mono tabular-nums",
                      active
                        ? "bg-primary/20 text-primary"
                        : "bg-bg-input text-text-sec",
                    )}
                  >
                    {category.servicesCount}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <AddCategoryDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </aside>
  );
}
