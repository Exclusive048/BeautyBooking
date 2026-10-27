"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { fetchJson } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";
import {
  AMOUNT_CLASS,
  EventDot,
  EventPerson,
  EventTime,
  LiveBadge,
} from "@/features/admin-cabinet/dashboard/components/event-parts";
import {
  ADMIN_EVENT_CATEGORIES,
  ADMIN_EVENTS_HISTORY_PAGE,
} from "@/features/admin-cabinet/dashboard/lib/event-categories";
import { useAdminEventsPoll } from "@/features/admin-cabinet/dashboard/lib/use-admin-events-poll";
import type {
  AdminEventCategory,
  AdminEventItem,
  AdminEventPerson,
  AdminEventsResponse,
} from "@/features/admin-cabinet/dashboard/types";

const T = UI_TEXT.adminPanel.dashboard.feed;

const EXPORT_DAYS = [7, 30, 90] as const;

// Одна сетка на шапку и строки: время · событие · кто · кого касается ·
// подробности · сумма. На телефоне строка складывается в карточку.
const ROW_GRID =
  "md:grid-cols-[7.5rem_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.6fr)_6.5rem]";

type Props = {
  category: AdminEventCategory;
  initial: AdminEventItem[];
  initialNextCursor: string | null;
};

/**
 * ADMIN-EVENTS-02 — страница «История событий»: разделы, полная таблица (кто,
 * что сделал, кого касается, подробности), «Показать ещё» по курсору, опрос
 * новых раз в 30 с и выгрузка раздела в Excel. Раздел — в адресе страницы,
 * смена раздела перерисовывает список с сервера.
 */
export function EventsHistory({ category, initial, initialNextCursor }: Props) {
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const [switching, startTransition] = useTransition();
  const [items, setItems] = useState<AdminEventItem[]>(initial);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exportDays, setExportDays] = useState<(typeof EXPORT_DAYS)[number]>(30);
  const seenIds = useRef<Set<string>>(new Set(initial.map((item) => item.id)));

  const latestMs = items.length > 0 ? items[0]!.timeMs : 0;

  const onFresh = useCallback((incoming: AdminEventItem[]) => {
    const fresh = incoming.filter((item) => !seenIds.current.has(item.id));
    if (fresh.length === 0) return;
    for (const item of fresh) seenIds.current.add(item.id);
    setItems((prev) => [...fresh, ...prev]);
  }, []);

  useAdminEventsPoll({ category, latestMs, onEvents: onFresh });

  // ADMIN-EVENTS-EXPORT: отказ выгрузки возвращает сюда с ?eventsExport=.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("eventsExport")) return;
    toast.error(T.exportFailed);
    params.delete("eventsExport");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, [toast]);

  const selectCategory = (next: string) => {
    if (next === category) return;
    startTransition(() => {
      router.replace(next === "all" ? pathname : `${pathname}?category=${next}`, { scroll: false });
    });
  };

  const loadMore = async () => {
    if (nextCursor === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ cursor: nextCursor, limit: String(ADMIN_EVENTS_HISTORY_PAGE) });
      if (category !== "all") params.set("category", category);
      const data = await fetchJson<AdminEventsResponse>(`/api/admin/dashboard/events?${params.toString()}`, {
        cache: "no-store",
      });
      const older = data.items.filter((item) => !seenIds.current.has(item.id));
      for (const item of older) seenIds.current.add(item.id);
      setItems((prev) => [...prev, ...older]);
      setNextCursor(data.nextCursor);
    } catch {
      // Листание без действия со стороны админа — своя строка, не серверная.
      toast.error(T.loadMoreFailed);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-bg-card p-3 shadow-card">
        <Tabs
          ariaLabel={T.categoriesAria}
          items={ADMIN_EVENT_CATEGORIES.map((id) => ({ id, label: T.categories[id] }))}
          value={category}
          onChange={selectCategory}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label={T.exportPeriodLabel}
            value={exportDays}
            onChange={(event) => setExportDays(Number(event.target.value) as (typeof EXPORT_DAYS)[number])}
            className="h-9 w-auto py-0 text-xs"
          >
            {EXPORT_DAYS.map((days) => (
              <option key={days} value={days}>
                {T.exportPeriod(days)}
              </option>
            ))}
          </Select>
          <Button asChild variant="secondary" size="sm">
            {/* Без `download`: файл отдаёт Content-Disposition, а отказ —
                редирект сюда же, который иначе скачался бы как HTML. */}
            {/* Адрес — литералом в JSX: навигационную цель видит пин FIX-B18
                (`api/bookings/ics-navigation.test.ts`). */}
            <a
              href={`/api/admin/dashboard/events/export?days=${exportDays}${
                category !== "all" ? `&category=${category}` : ""
              }`}
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              {T.exportCta}
            </a>
          </Button>
        </div>
      </div>

      <section
        aria-busy={switching}
        className={cn(
          "min-w-0 rounded-2xl border border-border-subtle bg-bg-card px-4 py-3 shadow-card transition-opacity md:px-5",
          switching && "opacity-60",
        )}
      >
        <div className="mb-1 flex items-center justify-end">
          <LiveBadge />
        </div>

        {items.length === 0 ? (
          <p className="py-10 text-center text-sm text-text-sec">
            {category === "all" ? T.empty : T.emptyCategory}
          </p>
        ) : (
          <>
            <div
              aria-hidden
              className={cn("hidden gap-3 border-b border-border-subtle pb-2 md:grid", ROW_GRID)}
            >
              <span className="eyebrow">{T.columns.time}</span>
              <span className="eyebrow">{T.columns.event}</span>
              <span className="eyebrow">{T.columns.actor}</span>
              <span className="eyebrow">{T.columns.subject}</span>
              <span className="eyebrow">{T.columns.details}</span>
              <span className="eyebrow text-right">{T.columns.amount}</span>
            </div>
            <ol>
              {items.map((item) => (
                <EventsHistoryRow key={item.id} event={item} />
              ))}
            </ol>
          </>
        )}

        {nextCursor !== null ? (
          <div className="mt-3 flex justify-center">
            <Button variant="secondary" size="sm" onClick={() => void loadMore()} disabled={loadingMore}>
              {T.loadMore}
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function PersonCell({ label, person }: { label: string; person: AdminEventPerson | null }) {
  if (!person) {
    return (
      <div className="hidden text-xs text-text-sec md:block" aria-hidden>
        —
      </div>
    );
  }
  return (
    <div className="col-span-2 min-w-0 text-xs md:col-span-1">
      {/* Подпись видна на телефоне, где колонок нет; на ПК — только диктору. */}
      <span className="eyebrow mr-1.5 md:sr-only">{label}</span>
      <EventPerson person={person} />
    </div>
  );
}

function EventsHistoryRow({ event }: { event: AdminEventItem }) {
  return (
    <li
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-b border-border-subtle py-3 last:border-b-0 md:items-start md:gap-y-0 md:py-2.5",
        ROW_GRID,
      )}
    >
      <EventTime
        timeIso={event.timeIso}
        timeMs={event.timeMs}
        className="col-span-2 md:col-span-1 md:pt-0.5"
      />
      <div className="flex min-w-0 items-start gap-1.5 text-sm font-medium text-text-main md:text-xs">
        <span className="pt-1.5 md:pt-1">
          <EventDot tone={event.dotTone} />
        </span>
        <span className="min-w-0 break-words">{event.action}</span>
      </div>
      <div
        className={cn(
          "text-right text-sm font-semibold tabular-nums md:order-last md:text-xs",
          AMOUNT_CLASS[event.amountTone],
        )}
      >
        {event.amountText ?? ""}
      </div>
      <PersonCell label={T.columns.actor} person={event.actor} />
      <PersonCell label={T.columns.subject} person={event.subject} />
      {event.details.length > 0 ? (
        <ul className="col-span-2 min-w-0 space-y-0.5 text-xs text-text-sec md:col-span-1">
          {event.details.map((line, index) => (
            <li key={index} className="break-words">
              {line}
            </li>
          ))}
        </ul>
      ) : (
        <div className="hidden md:block" aria-hidden />
      )}
    </li>
  );
}
