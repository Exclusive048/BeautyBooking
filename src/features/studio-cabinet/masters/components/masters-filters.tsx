"use client";

import { Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import * as UI_TEXT from "@/lib/ui/text";
import type {
  StudioMasterFilter,
  StudioMastersCounts,
} from "../server/types";
import { Tabs } from "@/components/ui/tabs";

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
  // UX-PASS-01: черновик поиска знал только начальное значение — «Сбросить»,
  // переход «назад» и смена фильтра со сбросом `q` оставляли в поле старый
  // текст, а следующая правка возвращала его в адрес. Пропс синхронизируется
  // в поле, кроме эха собственной отправки (иначе ответ сервера стирал бы
  // буквы, набранные за время запроса).
  const [seenSearch, setSeenSearch] = useState(search);
  const [pushedSearch, setPushedSearch] = useState(search);
  if (search !== seenSearch) {
    setSeenSearch(search);
    if (search !== pushedSearch) {
      setPushedSearch(search);
      setDraft(search);
    }
  }

  // Debounce search input → URL.
  useEffect(() => {
    if (draft === search) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(searchParams.toString());
      const trimmed = draft.trim();
      setPushedSearch(trimmed);
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
      <Tabs
        ariaLabel={T.tabsAria}
        items={TABS.map((tab) => ({ id: tab.id, label: T.tabs[tab.labelKey], badge: countFor(tab.id) }))}
        value={filter}
        onChange={(id) => setFilter(id as StudioMasterFilter)}
      />
    </div>
  );
}
