"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import * as UI_TEXT from "@/lib/ui/text";
import type { StudioClientMasterChip } from "../lib/types";

const T = UI_TEXT.studioCabinet.clientsV2.filters;

type Props = {
  search: string;
  masterId: string;
  masters: StudioClientMasterChip[];
};

export function ClientsFilters({ search, masterId, masters }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [draftSearch, setDraftSearch] = useState(search);

  useEffect(() => {
    setDraftSearch(search);
  }, [search]);

  // Debounced URL sync for the search field — avoids hammering the
  // server on every keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (draftSearch === search) return;
      const next = new URLSearchParams(searchParams.toString());
      if (draftSearch.trim().length > 0) next.set("q", draftSearch.trim());
      else next.delete("q");
      next.delete("cursor");
      router.replace(`?${next.toString()}`, { scroll: false });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [draftSearch, search, searchParams, router]);

  const handleMasterChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const next = new URLSearchParams(searchParams.toString());
    if (event.target.value === "all") next.delete("master");
    else next.set("master", event.target.value);
    next.delete("cursor");
    router.replace(`?${next.toString()}`, { scroll: false });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[220px] flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-sec"
          aria-hidden
        />
        <Input
          type="search"
          value={draftSearch}
          onChange={(e) => setDraftSearch(e.target.value)}
          placeholder={T.searchPlaceholder}
          className="pl-9"
          aria-label={T.searchPlaceholder}
        />
      </div>
      <Select
        value={masterId}
        onChange={handleMasterChange}
        className="min-w-[160px]"
        aria-label={T.masterAll}
      >
        <option value="all">{T.masterAll}</option>
        {masters.map((m) => (
          <option key={m.id} value={m.id}>
            {m.displayName}
          </option>
        ))}
      </Select>
    </div>
  );
}
