"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { Search, X, CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";
import { cn } from "@/lib/cn";
import type { ApiResponse } from "@/lib/types/api";

const t = UI_TEXT.master.bookingsPage;

type FilterKey = "all" | "today" | "upcoming" | "finished" | "cancelled";

type BookingItem = {
  id: string;
  slotLabel: string;
  startAtUtc: string | null;
  endAtUtc: string | null;
  status: string;
  clientName: string;
  clientPhone: string;
  serviceName: string;
  servicePrice: number;
  serviceDurationMin: number;
  actionRequiredBy: "CLIENT" | "MASTER" | null;
};

type GroupedDay = {
  dateKey: string;
  label: string;
  items: BookingItem[];
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function getStatusBadgeClass(status: string): string {
  if (status === "PENDING" || status === "CHANGE_REQUESTED") return "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
  if (status === "CONFIRMED") return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
  if (status === "IN_PROGRESS") return "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300";
  if (status === "FINISHED") return "bg-gray-100 text-gray-600 dark:bg-gray-800/40 dark:text-gray-300";
  if (status === "REJECTED") return "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300";
  return "bg-bg-input text-text-sec";
}

function statusLabel(status: string): string {
  const m: Record<string, string> = {
    PENDING: "Ожидает",
    CONFIRMED: "Подтверждена",
    IN_PROGRESS: "Идёт",
    FINISHED: "Завершена",
    REJECTED: "Отменена",
    CHANGE_REQUESTED: "Запрос переноса",
  };
  return m[status] ?? status;
}

function formatPrice(price: number): string {
  if (price === 0) return "Договорная";
  return `${new Intl.NumberFormat("ru-RU").format(price)} ₽`;
}

function toDateKey(isoStr: string | null, tz: string): string {
  if (!isoStr) return "";
  return new Date(isoStr).toLocaleDateString("en-CA", { timeZone: tz });
}

function formatDayLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(y!, (m ?? 1) - 1, d ?? 1);
  const today = new Date().toLocaleDateString("en-CA");
  const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString("en-CA");
  const prefix = dateKey === today ? "Сегодня, " : dateKey === tomorrow ? "Завтра, " : "";
  return (
    prefix +
    dt.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })
  );
}

function groupByDay(items: BookingItem[], tz: string): GroupedDay[] {
  const map = new Map<string, BookingItem[]>();
  for (const item of items) {
    const key = toDateKey(item.startAtUtc, tz);
    if (!key) continue;
    const arr = map.get(key) ?? [];
    arr.push(item);
    map.set(key, arr);
  }
  return Array.from(map.entries()).map(([dateKey, dayItems]) => ({
    dateKey,
    label: formatDayLabel(dateKey),
    items: dayItems,
  }));
}

// ── Booking card ─────────────────────────────────────────────────────────────

function BookingCard({
  booking,
  tz,
  onAction,
}: {
  booking: BookingItem;
  tz: string;
  onAction: (id: string, action: "CONFIRMED" | "REJECTED") => void;
}) {
  const needsAction =
    booking.status === "PENDING" && booking.actionRequiredBy === "MASTER";
  const [busy, setBusy] = useState(false);

  const handleAction = async (action: "CONFIRMED" | "REJECTED") => {
    setBusy(true);
    await onAction(booking.id, action);
    setBusy(false);
  };

  const timeLabel = booking.startAtUtc
    ? UI_FMT.timeShort(booking.startAtUtc, { timeZone: tz })
    : booking.slotLabel;

  return (
    <div className="border-b border-border-subtle/60 px-4 py-3.5 last:border-0">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-text-main">{timeLabel}</span>
        <Badge className={cn("shrink-0 text-[10px] font-medium", getStatusBadgeClass(booking.status))}>
          {statusLabel(booking.status)}
        </Badge>
      </div>

      <div className="mt-0.5 text-sm text-text-main">{booking.serviceName}</div>
      <div className="mt-0.5 text-xs text-text-sec">
        {booking.clientName || t.noClient}
        {booking.servicePrice > 0 ? ` · ${formatPrice(booking.servicePrice)}` : ""}
      </div>

      {needsAction ? (
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            className="flex-1"
            disabled={busy}
            onClick={() => void handleAction("CONFIRMED")}
          >
            {t.confirm}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="flex-1"
            disabled={busy}
            onClick={() => void handleAction("REJECTED")}
          >
            {t.reject}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "today", label: t.filterToday },
  { key: "all", label: t.filterAll },
  { key: "upcoming", label: t.filterUpcoming },
  { key: "finished", label: t.filterFinished },
  { key: "cancelled", label: t.filterCancelled },
];

export function MasterBookingsPage() {
  const tz = useViewerTimeZoneContext();
  const [filter, setFilter] = useState<FilterKey>("today");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [bookings, setBookings] = useState<BookingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ filter, limit: "100" });
      if (debouncedSearch) params.set("search", debouncedSearch);
      const res = await fetch(`/api/master/bookings?${params.toString()}`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ bookings: BookingItem[] }>
        | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : t.loadFailed);
      }
      setBookings(json.data.bookings);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [filter, debouncedSearch]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAction = useCallback(
    async (id: string, action: "CONFIRMED" | "REJECTED") => {
      try {
        const res = await fetch(`/api/master/bookings/${id}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: action }),
        });
        if (res.ok) {
          setBookings((prev) =>
            prev.map((b) =>
              b.id === id ? { ...b, status: action, actionRequiredBy: null } : b
            )
          );
        }
      } catch {
        // silent fail — booking list will refresh on next load
      }
    },
    []
  );

  const groups = useMemo(() => groupByDay(bookings, tz), [bookings, tz]);
  const isEmpty = !loading && !error && bookings.length === 0;

  return (
    <section className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-4 py-3">
        {showSearch ? (
          <div className="flex flex-1 items-center gap-2">
            <Input
              autoFocus
              placeholder={t.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 flex-1 text-sm"
            />
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setShowSearch(false);
              }}
              className="shrink-0 rounded-lg p-1.5 text-text-sec hover:text-text-main"
              aria-label="Закрыть поиск"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-text-main">{t.title}</h1>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowSearch(true)}
                className="rounded-lg p-2 text-text-sec hover:bg-bg-input hover:text-text-main"
                aria-label="Поиск"
              >
                <Search className="h-4 w-4" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Filter chips */}
      <div className="-mx-px flex gap-1.5 overflow-x-auto border-b border-border-subtle px-4 pb-2.5 pt-2.5 scrollbar-none">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
              filter === key
                ? "bg-primary text-white"
                : "bg-bg-input text-text-sec hover:bg-bg-elevated hover:text-text-main"
            )}
          >
            {key === "today" && <CalendarDays className="h-3 w-3" aria-hidden />}
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-2xl bg-bg-input" />
            ))}
          </div>
        ) : error ? (
          <div className="p-4">
            <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => void load()}>
              Повторить
            </Button>
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <div className="text-4xl">
              {filter === "today" ? "🎉" : "📅"}
            </div>
            <p className="font-semibold text-text-main">
              {filter === "today" ? t.emptyToday : t.empty}
            </p>
            <p className="text-sm text-text-sec">
              {filter === "today" ? t.emptyTodayHint : t.emptyHint}
            </p>
            {filter === "today" ? (
              <Button asChild size="sm" variant="secondary" className="mt-1">
                <Link href="/cabinet/master/model-offers">{t.emptyTodayCta}</Link>
              </Button>
            ) : null}
          </div>
        ) : (
          <div>
            {groups.map((group) => (
              <div key={group.dateKey}>
                {/* Day header */}
                <div className="sticky top-0 z-10 border-b border-border-subtle/40 bg-bg-input/80 px-4 py-2 backdrop-blur-sm">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-text-sec">
                    {group.label}
                  </span>
                </div>

                {/* Bookings for that day */}
                <div className="divide-y-0 rounded-none bg-bg-card">
                  {group.items.map((booking) => (
                    <BookingCard
                      key={booking.id}
                      booking={booking}
                      tz={tz}
                      onAction={handleAction}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
