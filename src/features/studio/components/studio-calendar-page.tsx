"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ApiResponse } from "@/lib/types/api";

type CalendarView = "day" | "week" | "month";

type CalendarMaster = {
  id: string;
  name: string;
};

type CalendarBooking = {
  id: string;
  masterId: string | null;
  serviceId: string;
  serviceTitle: string;
  startAt: string | null;
  endAt: string | null;
  status: string;
  clientName: string;
  clientPhone: string;
};

type CalendarBlock = {
  id: string;
  masterId: string;
  startAt: string;
  endAt: string;
  type: "BREAK" | "BLOCK";
};

type CalendarData = {
  masters: CalendarMaster[];
  bookings: CalendarBooking[];
  blocks: CalendarBlock[];
};

type ServicesData = {
  categories: Array<{
    id: string;
    title: string;
    services: Array<{
      id: string;
      title: string;
      masters: Array<{ masterId: string }>;
    }>;
  }>;
};

type Props = {
  studioId: string;
};

function toDateKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fromDateKey(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function startOfWeek(date: Date): Date {
  const day = date.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  return addDays(date, diffToMonday);
}

function monthGridStart(date: Date): Date {
  const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  return startOfWeek(first);
}

function statusClass(status: string): string {
  if (status === "CONFIRMED" || status === "PREPAID") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "CANCELLED" || status === "NO_SHOW") return "border-neutral-300 bg-neutral-100 text-neutral-700";
  return "border-blue-200 bg-blue-50 text-blue-800";
}

function timeRangeLabel(startAt: string | null, endAt: string | null): string {
  if (!startAt || !endAt) return "Time is not set";
  const start = new Date(startAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const end = new Date(endAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return `${start}–${end}`;
}

function dayLabel(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00.000Z`).toLocaleDateString("ru-RU", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

export function StudioCalendarPage({ studioId }: Props) {
  const [view, setView] = useState<CalendarView>("week");
  const [date, setDate] = useState(() => toDateKey(new Date()));
  const [data, setData] = useState<CalendarData>({ masters: [], bookings: [], blocks: [] });
  const [servicesData, setServicesData] = useState<ServicesData>({ categories: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [masterFilter, setMasterFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [monthDetailsDay, setMonthDetailsDay] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ studioId, date, view });
      const [calendarRes, servicesRes] = await Promise.all([
        fetch(`/api/studio/calendar?${params.toString()}`, { cache: "no-store" }),
        fetch(`/api/studio/services?studioId=${studioId}`, { cache: "no-store" }),
      ]);

      const calendarJson = (await calendarRes.json().catch(() => null)) as ApiResponse<CalendarData> | null;
      if (!calendarRes.ok || !calendarJson || !calendarJson.ok) {
        throw new Error(
          calendarJson && !calendarJson.ok ? calendarJson.error.message : `API error: ${calendarRes.status}`
        );
      }

      const servicesJson = (await servicesRes.json().catch(() => null)) as ApiResponse<ServicesData> | null;
      if (!servicesRes.ok || !servicesJson || !servicesJson.ok) {
        throw new Error(
          servicesJson && !servicesJson.ok ? servicesJson.error.message : `API error: ${servicesRes.status}`
        );
      }

      setData(calendarJson.data);
      setServicesData(servicesJson.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load calendar");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studioId, date, view]);

  const serviceMetaById = useMemo(() => {
    const map = new Map<string, { categoryId: string; categoryTitle: string; title: string }>();
    for (const category of servicesData.categories) {
      for (const service of category.services) {
        map.set(service.id, {
          categoryId: category.id,
          categoryTitle: category.title,
          title: service.title,
        });
      }
    }
    return map;
  }, [servicesData.categories]);

  const statusOptions = useMemo(
    () => Array.from(new Set(data.bookings.map((booking) => booking.status))).sort(),
    [data.bookings]
  );

  const serviceOptions = useMemo(() => {
    const all = servicesData.categories.flatMap((category) =>
      category.services.map((service) => ({
        id: service.id,
        title: service.title,
        categoryId: category.id,
      }))
    );
    if (categoryFilter === "all") return all;
    return all.filter((service) => service.categoryId === categoryFilter);
  }, [categoryFilter, servicesData.categories]);

  useEffect(() => {
    if (serviceFilter !== "all" && !serviceOptions.some((service) => service.id === serviceFilter)) {
      setServiceFilter("all");
    }
  }, [serviceFilter, serviceOptions]);

  const filteredBookings = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.bookings.filter((booking) => {
      if (masterFilter !== "all" && booking.masterId !== masterFilter) return false;
      if (serviceFilter !== "all" && booking.serviceId !== serviceFilter) return false;
      if (categoryFilter !== "all" && serviceMetaById.get(booking.serviceId)?.categoryId !== categoryFilter) {
        return false;
      }
      if (statusFilter !== "all" && booking.status !== statusFilter) return false;
      if (!q) return true;
      return (
        booking.clientName.toLowerCase().includes(q) ||
        booking.clientPhone.toLowerCase().includes(q) ||
        booking.serviceTitle.toLowerCase().includes(q)
      );
    });
  }, [categoryFilter, data.bookings, masterFilter, query, serviceFilter, serviceMetaById, statusFilter]);

  const filteredBlocks = useMemo(() => {
    return data.blocks.filter((block) => {
      if (masterFilter !== "all" && block.masterId !== masterFilter) return false;
      return true;
    });
  }, [data.blocks, masterFilter]);

  const dayKeys = useMemo(() => {
    const selectedDate = fromDateKey(date);
    if (view === "day") return [date];
    if (view === "week") {
      const start = startOfWeek(selectedDate);
      return Array.from({ length: 7 }, (_, index) => toDateKey(addDays(start, index)));
    }
    const monthStart = monthGridStart(selectedDate);
    return Array.from({ length: 42 }, (_, index) => toDateKey(addDays(monthStart, index)));
  }, [date, view]);

  const bookingsByDay = useMemo(() => {
    const map = new Map<string, CalendarBooking[]>();
    for (const booking of filteredBookings) {
      if (!booking.startAt) continue;
      const key = toDateKey(new Date(booking.startAt));
      const list = map.get(key) ?? [];
      list.push(booking);
      map.set(key, list);
    }
    return map;
  }, [filteredBookings]);

  const blocksByDay = useMemo(() => {
    const map = new Map<string, CalendarBlock[]>();
    for (const block of filteredBlocks) {
      const key = toDateKey(new Date(block.startAt));
      const list = map.get(key) ?? [];
      list.push(block);
      map.set(key, list);
    }
    return map;
  }, [filteredBlocks]);

  const monthBase = fromDateKey(date);
  const activeMonth = monthBase.getUTCMonth();
  const activeYear = monthBase.getUTCFullYear();

  const monthDayDetails = useMemo(() => {
    if (!monthDetailsDay) return { bookings: [], blocks: [] };
    const bookings = (bookingsByDay.get(monthDetailsDay) ?? []).slice().sort((a, b) => {
      const aTime = a.startAt ? new Date(a.startAt).getTime() : 0;
      const bTime = b.startAt ? new Date(b.startAt).getTime() : 0;
      return aTime - bTime;
    });
    const blocks = (blocksByDay.get(monthDetailsDay) ?? []).slice().sort((a, b) => {
      return new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
    });
    return { bookings, blocks };
  }, [blocksByDay, bookingsByDay, monthDetailsDay]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
          />
          {(["day", "week", "month"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setView(item)}
              className={`rounded-lg border px-3 py-2 text-sm ${
                view === item ? "border-black bg-black text-white" : "border-neutral-300"
              }`}
            >
              {item.toUpperCase()}
            </button>
          ))}
          <input
            type="search"
            placeholder="Search client / phone / service"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-[220px] rounded-lg border px-3 py-2 text-sm"
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={masterFilter}
            onChange={(event) => setMasterFilter(event.target.value)}
            className="rounded-lg border px-3 py-1.5 text-sm"
          >
            <option value="all">All masters</option>
            {data.masters.map((master) => (
              <option key={master.id} value={master.id}>
                {master.name}
              </option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className="rounded-lg border px-3 py-1.5 text-sm"
          >
            <option value="all">All categories</option>
            {servicesData.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.title}
              </option>
            ))}
          </select>
          <select
            value={serviceFilter}
            onChange={(event) => setServiceFilter(event.target.value)}
            className="rounded-lg border px-3 py-1.5 text-sm"
          >
            <option value="all">All services</option>
            {serviceOptions.map((service) => (
              <option key={service.id} value={service.id}>
                {service.title}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-lg border px-3 py-1.5 text-sm"
          >
            <option value="all">All statuses</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? <div className="rounded-2xl border p-6 text-sm">Loading...</div> : null}
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      {!loading && data.masters.length === 0 ? (
        <div className="rounded-2xl border p-5">
          <h3 className="text-base font-semibold">No masters</h3>
          <p className="mt-1 text-sm text-neutral-600">Add masters first in Team.</p>
          <Link href="/cabinet/studio/team" className="mt-3 inline-flex rounded-lg border px-3 py-2 text-sm hover:bg-neutral-50">
            Go to Team
          </Link>
        </div>
      ) : null}

      {!loading && data.masters.length > 0 && view === "month" ? (
        <div className="rounded-2xl border p-3">
          <div className="grid grid-cols-7 gap-2 text-center text-xs text-neutral-500">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
              <div key={day}>{day}</div>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-2">
            {dayKeys.map((dayKey) => {
              const dayDate = fromDateKey(dayKey);
              const isCurrentMonth =
                dayDate.getUTCMonth() === activeMonth && dayDate.getUTCFullYear() === activeYear;
              const bookingsCount = bookingsByDay.get(dayKey)?.length ?? 0;
              const blocksCount = blocksByDay.get(dayKey)?.length ?? 0;
              return (
                <button
                  key={dayKey}
                  type="button"
                  onClick={() => setMonthDetailsDay(dayKey)}
                  className={`min-h-[92px] rounded-xl border p-2 text-left transition hover:border-neutral-400 ${
                    isCurrentMonth ? "bg-white" : "bg-neutral-50 text-neutral-400"
                  }`}
                >
                  <div className="text-xs font-medium">{dayDate.getUTCDate()}</div>
                  <div className="mt-2 space-y-1 text-[11px]">
                    <div className="rounded-md bg-neutral-100 px-2 py-1 text-neutral-700">Bookings: {bookingsCount}</div>
                    <div className="rounded-md bg-neutral-100 px-2 py-1 text-neutral-700">Blocks: {blocksCount}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {!loading && data.masters.length > 0 && view !== "month" ? (
        <div className="space-y-3">
          {dayKeys.map((dayKey) => {
            const bookings = (bookingsByDay.get(dayKey) ?? []).slice().sort((a, b) => {
              const aTime = a.startAt ? new Date(a.startAt).getTime() : 0;
              const bTime = b.startAt ? new Date(b.startAt).getTime() : 0;
              return aTime - bTime;
            });
            const blocks = (blocksByDay.get(dayKey) ?? []).slice().sort((a, b) => {
              return new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
            });
            return (
              <section key={dayKey} className="rounded-2xl border p-4">
                <header className="mb-3 text-sm font-semibold">{dayLabel(dayKey)}</header>
                <div className="space-y-2">
                  {bookings.map((booking) => (
                    <article key={booking.id} className={`rounded-xl border p-3 text-sm ${statusClass(booking.status)}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-medium">{booking.clientName}</div>
                        <div className="text-xs">{timeRangeLabel(booking.startAt, booking.endAt)}</div>
                      </div>
                      <div className="mt-1 text-xs">
                        {booking.status} · {booking.serviceTitle} · {booking.clientPhone}
                      </div>
                    </article>
                  ))}
                  {blocks.map((block) => (
                    <article key={block.id} className="rounded-xl border border-neutral-300 bg-neutral-100 p-3 text-sm text-neutral-700">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium">{block.type}</div>
                        <div className="text-xs">
                          {timeRangeLabel(block.startAt, block.endAt)}
                        </div>
                      </div>
                    </article>
                  ))}
                  {bookings.length === 0 && blocks.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-3 text-sm text-neutral-500">No items for this day.</div>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      ) : null}

      {monthDetailsDay ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl border bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold">Day details — {dayLabel(monthDetailsDay)}</h3>
              <button type="button" onClick={() => setMonthDetailsDay(null)} className="rounded-lg border px-3 py-1.5 text-sm">
                Close
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {monthDayDetails.bookings.map((booking) => (
                <article key={booking.id} className={`rounded-xl border p-3 text-sm ${statusClass(booking.status)}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium">{booking.clientName}</div>
                    <div className="text-xs">{timeRangeLabel(booking.startAt, booking.endAt)}</div>
                  </div>
                  <div className="mt-1 text-xs">
                    {booking.status} · {booking.serviceTitle} · {booking.clientPhone}
                  </div>
                </article>
              ))}
              {monthDayDetails.blocks.map((block) => (
                <article key={block.id} className="rounded-xl border border-neutral-300 bg-neutral-100 p-3 text-sm text-neutral-700">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{block.type}</div>
                    <div className="text-xs">{timeRangeLabel(block.startAt, block.endAt)}</div>
                  </div>
                </article>
              ))}
              {monthDayDetails.bookings.length === 0 && monthDayDetails.blocks.length === 0 ? (
                <div className="rounded-xl border border-dashed p-3 text-sm text-neutral-500">No items for this day.</div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
