"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";
import type {
  AdminReviewTab,
  AdminReviewsCounts,
} from "@/features/admin-cabinet/reviews/types";

const T = UI_TEXT.adminPanel.reviews;
const SEARCH_DEBOUNCE_MS = 200;

type Props = {
  tab: AdminReviewTab;
  search: string;
  counts: AdminReviewsCounts;
};

const TABS: Array<{ value: AdminReviewTab; labelKey: keyof typeof T.tabs; countKey: keyof AdminReviewsCounts }> = [
  { value: "flagged", labelKey: "flagged", countKey: "flagged" },
  { value: "low", labelKey: "low", countKey: "low" },
  { value: "all", labelKey: "all", countKey: "all" },
];

/** 3-tab strip + debounced search. URL is the source of truth —
 * each change replaces history (not push) so the back button takes
 * the admin out of the cabinet instead of through filter combos. */
export function ReviewsFilters({ tab, search, counts }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchValue, setSearchValue] = useState(search);
  const [, startTransition] = useTransition();

  const pushParams = useCallback(
    (mutator: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      mutator(params);
      // Reset cursor so a filter change starts the list from page 1
      // instead of inheriting an unrelated cursor from the previous
      // filter state.
      params.delete("cursor");
      const qs = params.toString();
      startTransition(() => {
        router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    if (searchValue === search) return;
    const handle = window.setTimeout(() => {
      pushParams((params) => {
        if (searchValue.trim()) params.set("q", searchValue.trim());
        else params.delete("q");
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [searchValue, search, pushParams]);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border-subtle bg-bg-card p-3 shadow-card">
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-bg-input/60 p-1">
        {TABS.map((tabDef) => {
          const active = tab === tabDef.value;
          return (
            <button
              key={tabDef.value}
              type="button"
              onClick={() =>
                pushParams((params) => {
                  if (tabDef.value === "flagged") params.delete("tab");
                  else params.set("tab", tabDef.value);
                })
              }
              className={cn(
                "inline-flex h-8 items-center gap-2 rounded-lg px-3 text-sm transition-colors",
                active
                  ? "bg-bg-card text-text-main shadow-sm"
                  : "text-text-sec hover:text-text-main",
              )}
            >
              <span>{T.tabs[tabDef.labelKey]}</span>
              <span
                className={cn(
                  "rounded-full px-1.5 font-mono text-[11px] tabular-nums",
                  active ? "bg-bg-input text-text-main" : "text-text-sec/80",
                )}
              >
                {counts[tabDef.countKey]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="relative min-w-[14rem] flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-sec"
          aria-hidden
        />
        <Input
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          placeholder={T.filters.searchPlaceholder}
          className="pl-9"
        />
      </div>
    </div>
  );
}
