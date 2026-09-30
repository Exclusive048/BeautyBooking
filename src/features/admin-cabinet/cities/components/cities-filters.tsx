"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import * as UI_TEXT from "@/lib/ui/text";
import type {
  AdminCitiesCounts,
  AdminCityStatusFilter,
} from "@/features/admin-cabinet/cities/types";
import { Tabs } from "@/components/ui/tabs";

type Props = {
  status: AdminCityStatusFilter;
  search: string;
  counts: AdminCitiesCounts;
};

const T = UI_TEXT.adminPanel.cities.filters;
const SEARCH_DEBOUNCE_MS = 200;

const STATUS_TABS: Array<{
  value: AdminCityStatusFilter;
  label: string;
  countKey: keyof AdminCitiesCounts;
}> = [
  { value: "all", label: T.status.all, countKey: "all" },
  { value: "visible", label: T.status.visible, countKey: "visible" },
  { value: "hidden", label: T.status.hidden, countKey: "hidden" },
  { value: "dup", label: T.status.dup, countKey: "dup" },
];

export function CitiesFilters({ status, search, counts }: Props) {
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

  // Debounced text-input → URL sync (matches the catalog filter UX).
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
      <Tabs
        ariaLabel={T.statusAria}
        items={STATUS_TABS.map((tab) => ({ id: tab.value, label: tab.label, badge: counts[tab.countKey] }))}
        value={status}
        onChange={(id) =>
          pushParams((params) => {
            if (id === "all") params.delete("status");
            else params.set("status", id);
            // Clear selection when changing tab so a hidden row
            // doesn't stay open on screen after filtering it out.
            params.delete("selected");
          })
        }
      />

      <div className="relative min-w-[14rem] flex-1">
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
