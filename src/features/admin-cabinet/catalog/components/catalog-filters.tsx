"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";
import type {
  AdminCategoryCounts,
  AdminCategoryParentOption,
  AdminCategoryStatusFilter,
} from "@/features/admin-cabinet/catalog/types";

type Props = {
  status: AdminCategoryStatusFilter;
  parent: string | "all" | "root";
  search: string;
  counts: AdminCategoryCounts;
  parentOptions: AdminCategoryParentOption[];
};

const T = UI_TEXT.adminPanel.catalog.filters;
const SEARCH_DEBOUNCE_MS = 200;

const STATUS_TABS: Array<{
  value: AdminCategoryStatusFilter;
  label: string;
  countKey: keyof AdminCategoryCounts;
}> = [
  { value: "all", label: T.status.all, countKey: "all" },
  { value: "pending", label: T.status.pending, countKey: "pending" },
  { value: "approved", label: T.status.approved, countKey: "approved" },
  { value: "rejected", label: T.status.rejected, countKey: "rejected" },
];

/**
 * Filter bar with URL state. Sets `?status`, `?parent`, `?q` via
 * `router.replace({ scroll: false })` so the back/forward stack stays
 * intact (the user expects "back" to take them out of the cabinet,
 * not toggle through filter combinations).
 *
 * Search is debounced 200 ms — fast enough to feel live while saving
 * one round-trip per keystroke.
 */
export function CatalogFilters({
  status,
  parent,
  search,
  counts,
  parentOptions,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchValue, setSearchValue] = useState(search);
  const [, startTransition] = useTransition();

  const pushParams = useCallback(
    (mutator: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      mutator(params);
      const qs = params.toString();
      startTransition(() => {
        router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  // Debounced sync of the text input into the URL.
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
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-border-subtle bg-bg-card p-1 shadow-card">
        {STATUS_TABS.map((tab) => {
          const active = status === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() =>
                pushParams((params) => {
                  if (tab.value === "all") params.delete("status");
                  else params.set("status", tab.value);
                })
              }
              className={cn(
                "inline-flex h-8 items-center gap-2 rounded-xl px-3 text-sm transition-colors",
                active
                  ? "bg-bg-input text-text-main shadow-sm"
                  : "text-text-sec hover:bg-bg-input/60 hover:text-text-main",
              )}
            >
              <span>{tab.label}</span>
              <span
                className={cn(
                  "rounded-full px-1.5 font-mono text-[11px] tabular-nums",
                  active ? "bg-bg-card text-text-main" : "text-text-sec",
                )}
              >
                {counts[tab.countKey]}
              </span>
            </button>
          );
        })}
      </div>

      <Select
        value={parent}
        aria-label={T.parentLabel}
        onChange={(event) =>
          pushParams((params) => {
            const next = event.target.value;
            if (next === "all") params.delete("parent");
            else params.set("parent", next);
          })
        }
        className="h-10 min-w-[14rem]"
      >
        <option value="all">{T.parentAll}</option>
        <option value="root">{T.parentRoot}</option>
        {parentOptions.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>

      <div className="relative min-w-[16rem] flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-sec"
          aria-hidden
        />
        <Input
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          placeholder={T.searchPlaceholder}
          className="pl-9"
        />
      </div>
    </div>
  );
}
