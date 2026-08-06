"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BookingStatus } from "@/lib/prisma-enums";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";
import type { BookingsTimeRange } from "../lib/time-range-filter";
import type {
  MasterOption,
  StudioBookingsRangeCounts,
} from "../server/types";

const T = UI_TEXT.studioCabinet.bookingsV2.filters;

const RANGES: Array<{ id: BookingsTimeRange; labelKey: keyof typeof T.ranges }> = [
  { id: "today", labelKey: "today" },
  { id: "tomorrow", labelKey: "tomorrow" },
  { id: "week", labelKey: "week" },
  { id: "all", labelKey: "all" },
];

const STATUSES: BookingStatus[] = [
  BookingStatus.PENDING,
  BookingStatus.CONFIRMED,
  BookingStatus.IN_PROGRESS,
  BookingStatus.FINISHED,
  BookingStatus.NO_SHOW,
  BookingStatus.CANCELLED,
];

type Props = {
  range: BookingsTimeRange;
  status: BookingStatus | "all";
  masterId: string | "all";
  search: string;
  counts: StudioBookingsRangeCounts;
  masters: MasterOption[];
};

export function BookingsFilters({
  range,
  status,
  masterId,
  search,
  counts,
  masters,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [draft, setDraft] = useState(search);

  useEffect(() => {
    if (draft === search) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(searchParams.toString());
      const trimmed = draft.trim();
      if (trimmed) next.set("q", trimmed);
      else next.delete("q");
      next.delete("cursor");
      router.replace(`?${next.toString()}`, { scroll: false });
    }, 250);
    return () => clearTimeout(timer);
  }, [draft, search, router, searchParams]);

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value === null || value === "" || value === "all") next.delete(key);
    else next.set(key, value);
    next.delete("cursor");
    router.replace(`?${next.toString()}`, { scroll: false });
  };

  const countFor = (id: BookingsTimeRange): number => counts[id];

  return (
    <div className="space-y-3 rounded-2xl border border-border-subtle bg-bg-card p-4">
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border-subtle bg-bg-page p-1">
        {RANGES.map((opt) => {
          const active = opt.id === range;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => set("range", opt.id === "today" ? null : opt.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-bg-card text-text-main shadow-card"
                  : "bg-transparent text-text-sec hover:text-text-main",
              )}
              aria-pressed={active}
            >
              {T.ranges[opt.labelKey]}
              <span className="ml-1.5 text-xs text-text-sec">{countFor(opt.id)}</span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_220px_220px]">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-sec"
            aria-hidden
          />
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={T.searchPlaceholder}
            className="pl-9"
          />
        </div>
        <Select
          value={status}
          onChange={(e) => set("status", e.target.value)}
        >
          <option value="all">{T.statusAll}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {T.statusLabels[s] ?? s}
            </option>
          ))}
        </Select>
        <Select
          value={masterId}
          onChange={(e) => set("master", e.target.value)}
        >
          <option value="all">{T.masterAll}</option>
          {masters.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
