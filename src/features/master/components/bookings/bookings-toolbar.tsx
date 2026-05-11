"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { Tabs } from "@/components/ui/tabs";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.bookings.toolbar;

const formatRub = (kopeks: number) => UI_FMT.priceLabel(kopeks);

type Props = {
  initialSearch: string;
  initialTab: string;
  stats: { total: number; pendingSum: number; confirmedSum: number };
};

const TABS = [
  { id: "all", label: T.tabAll },
  { id: "new", label: T.tabNew },
  { id: "regular", label: T.tabRegular },
];

/**
 * Client island that owns the search-debounce + tab-switching loop. Both
 * controls write to URL (`?q=`, `?tab=`) and the server page re-renders
 * with new data — no client-side filtering of the kanban itself.
 */
export function BookingsToolbar({ initialSearch, initialTab, stats }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(initialSearch);
  const debouncedSearch = useDebouncedValue(search, 300);

  // Sync URL `?q=` whenever the debounced value diverges. We compare
  // against the current search-param value (not initialSearch) because the
  // user may navigate elsewhere and come back; initialSearch is stale by
  // then.
  useEffect(() => {
    const current = searchParams.get("q") ?? "";
    if (debouncedSearch === current) return;
    const next = new URLSearchParams(searchParams.toString());
    if (debouncedSearch) next.set("q", debouncedSearch);
    else next.delete("q");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [debouncedSearch, pathname, router, searchParams]);

  const handleTabChange = (id: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (id === "all") next.delete("tab");
    else next.set("tab", id);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-card p-3 lg:p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-sec"
          />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={T.searchPlaceholder}
            aria-label={T.searchPlaceholder}
            className="h-10 w-full rounded-xl border border-border-subtle bg-bg-page pl-9 pr-3 text-sm text-text-main placeholder:text-text-sec transition-shadow focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <Tabs items={TABS} value={initialTab} onChange={handleTabChange} />

        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="text-text-sec">
            {T.statTotal}:{" "}
            <span className="font-medium tabular-nums text-text-main">{stats.total}</span>
          </span>
          <span className="text-text-sec">
            {T.statPending}:{" "}
            <span className="font-medium tabular-nums text-amber-700 dark:text-amber-300">
              {formatRub(stats.pendingSum)}
            </span>
          </span>
          <span className="text-text-sec">
            {T.statConfirmed}:{" "}
            <span className="font-medium tabular-nums text-text-main">
              {formatRub(stats.confirmedSum)}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
