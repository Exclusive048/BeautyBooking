"use client";

import { Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";
import type {
  StudioMasterFilter,
  StudioMastersCounts,
} from "../server/types";

const T = UI_TEXT.studioCabinet.mastersV2.filters;

const TABS: Array<{ id: StudioMasterFilter; labelKey: keyof typeof T.tabs }> = [
  { id: "all", labelKey: "all" },
  { id: "active", labelKey: "active" },
  { id: "invited", labelKey: "invited" },
  { id: "disabled", labelKey: "disabled" },
];

export function MastersFilters({
  filter,
  search,
  counts,
}: {
  filter: StudioMasterFilter;
  search: string;
  counts: StudioMastersCounts;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [draft, setDraft] = useState(search);

  // Debounce search input → URL.
  useEffect(() => {
    if (draft === search) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(searchParams.toString());
      const trimmed = draft.trim();
      if (trimmed) next.set("q", trimmed);
      else next.delete("q");
      next.delete("master");
      router.replace(`?${next.toString()}`, { scroll: false });
    }, 250);
    return () => clearTimeout(timer);
  }, [draft, search, router, searchParams]);

  const setFilter = (next: StudioMasterFilter) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") params.delete("tab");
    else params.set("tab", next);
    params.delete("master");
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const countFor = (id: StudioMasterFilter): number => {
    switch (id) {
      case "all":
        return counts.total;
      case "active":
        return counts.active;
      case "invited":
        return counts.invited;
      case "disabled":
        return counts.disabled;
    }
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-sec"
          aria-hidden
        />
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={T.searchPlaceholder}
          className="pl-9"
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border-subtle bg-bg-page p-1">
        {TABS.map((tab) => {
          const isActive = tab.id === filter;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-bg-card text-text-main shadow-card"
                  : "bg-transparent text-text-sec hover:text-text-main",
              )}
              aria-pressed={isActive}
            >
              {T.tabs[tab.labelKey]}
              <span className="ml-1.5 text-xs text-text-sec">{countFor(tab.id)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
