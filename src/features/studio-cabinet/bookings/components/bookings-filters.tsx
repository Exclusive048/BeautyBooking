"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import * as UI_TEXT from "@/lib/ui/text";
import {
  STUDIO_BOOKING_STATUS_GROUP_IDS,
  type StudioBookingStatusGroup,
} from "../lib/status-groups";
import type { BookingsTimeRange } from "../lib/time-range-filter";
import type {
  MasterOption,
  StudioBookingsRangeCounts,
} from "../server/types";
import { Tabs } from "@/components/ui/tabs";

const T = UI_TEXT.studioCabinet.bookingsV2.filters;

const RANGES: Array<{ id: BookingsTimeRange; labelKey: keyof typeof T.ranges }> = [
  { id: "today", labelKey: "today" },
  { id: "tomorrow", labelKey: "tomorrow" },
  { id: "week", labelKey: "week" },
  { id: "all", labelKey: "all" },
];

// UX-PASS-01: пункты фильтра — группы статусов (`status-groups.ts`); подпись
// группы — подпись её главного статуса.
const STATUS_GROUP_LABELS: Record<StudioBookingStatusGroup, string> = {
  awaiting: T.statusLabels.PENDING,
  confirmed: T.statusLabels.CONFIRMED,
  finished: T.statusLabels.FINISHED,
  cancelled: T.statusLabels.CANCELLED,
  no_show: T.statusLabels.NO_SHOW,
};

type Props = {
  range: BookingsTimeRange;
  status: StudioBookingStatusGroup | "all";
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

  useEffect(() => {
    if (draft === search) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(searchParams.toString());
      const trimmed = draft.trim();
      setPushedSearch(trimmed);
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
      <Tabs
        ariaLabel={T.rangeAria}
        items={RANGES.map((opt) => ({ id: opt.id, label: T.ranges[opt.labelKey], badge: countFor(opt.id) }))}
        value={range}
        onChange={(id) => set("range", id === "today" ? null : id)}
      />

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
          {STUDIO_BOOKING_STATUS_GROUP_IDS.map((group) => (
            <option key={group} value={group}>
              {STATUS_GROUP_LABELS[group]}
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
