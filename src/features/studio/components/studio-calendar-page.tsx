"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ApiResponse } from "@/lib/types/api";

type CalendarView = "day" | "week" | "month";
type CalendarMode = "none" | "block" | "booking";

type CalendarMaster = {
  id: string;
  name: string;
};

type CalendarBooking = {
  id: string;
  masterId: string | null;
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

function statusColor(status: string): string {
  if (status === "CONFIRMED" || status === "PREPAID") return "bg-emerald-100 border-emerald-300";
  if (status === "CANCELLED") return "bg-red-50 border-red-200";
  if (status === "NO_SHOW") return "bg-neutral-200 border-neutral-300";
  return "bg-white border-neutral-300";
}

function toDateKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function slotToIso(dateKey: string, hour: number): string {
  return `${dateKey}T${String(hour).padStart(2, "0")}:00:00.000Z`;
}

export function StudioCalendarPage({ studioId }: Props) {
  const [view, setView] = useState<CalendarView>("week");
  const [date, setDate] = useState(() => toDateKey(new Date()));
  const [data, setData] = useState<CalendarData>({ masters: [], bookings: [], blocks: [] });
  const [servicesData, setServicesData] = useState<ServicesData>({ categories: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<CalendarMode>("none");
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [bookingModal, setBookingModal] = useState<{ masterId: string; hour: number } | null>(null);
  const [bookingClientName, setBookingClientName] = useState("");
  const [bookingClientPhone, setBookingClientPhone] = useState("");
  const [bookingServiceId, setBookingServiceId] = useState("");
  const [saving, setSaving] = useState(false);

  const hours = useMemo(() => Array.from({ length: 12 }).map((_, index) => index + 9), []);

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
        throw new Error(calendarJson && !calendarJson.ok ? calendarJson.error.message : `API error: ${calendarRes.status}`);
      }

      const servicesJson = (await servicesRes.json().catch(() => null)) as ApiResponse<ServicesData> | null;
      if (!servicesRes.ok || !servicesJson || !servicesJson.ok) {
        throw new Error(servicesJson && !servicesJson.ok ? servicesJson.error.message : `API error: ${servicesRes.status}`);
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

  const bookingMap = useMemo(() => {
    const map = new Map<string, CalendarBooking[]>();
    for (const booking of data.bookings) {
      if (!booking.masterId || !booking.startAt) continue;
      const dt = new Date(booking.startAt);
      const key = `${booking.masterId}:${dt.getUTCHours()}`;
      const list = map.get(key) ?? [];
      list.push(booking);
      map.set(key, list);
    }
    return map;
  }, [data.bookings]);

  const blockMap = useMemo(() => {
    const map = new Map<string, CalendarBlock[]>();
    for (const block of data.blocks) {
      const dt = new Date(block.startAt);
      const key = `${block.masterId}:${dt.getUTCHours()}`;
      const list = map.get(key) ?? [];
      list.push(block);
      map.set(key, list);
    }
    return map;
  }, [data.blocks]);

  const hasServices = useMemo(
    () => servicesData.categories.some((category) => category.services.length > 0),
    [servicesData.categories]
  );

  const hasAssignedServices = useMemo(
    () =>
      servicesData.categories.some((category) =>
        category.services.some((service) => service.masters.length > 0)
      ),
    [servicesData.categories]
  );

  const categories = useMemo(
    () => servicesData.categories.map((category) => ({ id: category.id, title: category.title })),
    [servicesData.categories]
  );

  const servicesForSelectedMaster = useMemo(() => {
    if (!bookingModal) return [];
    const masterId = bookingModal.masterId;
    const all = servicesData.categories.flatMap((category) =>
      category.services
        .filter((service) => service.masters.some((master) => master.masterId === masterId))
        .map((service) => ({
          id: service.id,
          title: service.title,
          categoryId: category.id,
        }))
    );
    if (categoryFilter === "all") return all;
    return all.filter((service) => service.categoryId === categoryFilter);
  }, [bookingModal, servicesData.categories, categoryFilter]);

  const filteredBookings = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data.bookings;
    return data.bookings.filter((booking) => {
      return (
        booking.clientName.toLowerCase().includes(q) ||
        booking.clientPhone.toLowerCase().includes(q)
      );
    });
  }, [data.bookings, query]);

  const filteredBookingIds = useMemo(
    () => new Set(filteredBookings.map((booking) => booking.id)),
    [filteredBookings]
  );

  const onSlotClick = async (masterId: string, hour: number): Promise<void> => {
    if (mode === "block") {
      const startAt = slotToIso(date, hour);
      const endAt = slotToIso(date, hour + 1);
      const res = await fetch("/api/studio/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studioId,
          masterId,
          startAt,
          endAt,
          type: "BLOCK",
        }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ block: CalendarBlock }> | null;
      if (!res.ok || !json || !json.ok) {
        setError(json && !json.ok ? json.error.message : `API error: ${res.status}`);
        return;
      }
      await load();
      return;
    }

    if (mode === "booking") {
      setBookingModal({ masterId, hour });
      setBookingServiceId("");
      setBookingClientName("");
      setBookingClientPhone("");
    }
  };

  const createBooking = async (): Promise<void> => {
    if (!bookingModal || !bookingServiceId || !bookingClientName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const startAt = slotToIso(date, bookingModal.hour);
      const res = await fetch("/api/studio/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studioId,
          masterId: bookingModal.masterId,
          startAt,
          serviceId: bookingServiceId,
          clientName: bookingClientName.trim(),
          clientPhone: bookingClientPhone.trim() || undefined,
        }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ id: string }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      setBookingModal(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create booking");
    } finally {
      setSaving(false);
    }
  };

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
            placeholder="Search by client or phone"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-[220px] rounded-lg border px-3 py-2 text-sm"
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-neutral-500">Tools:</span>
          <button
            type="button"
            onClick={() => setMode((current) => (current === "block" ? "none" : "block"))}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              mode === "block" ? "border-amber-300 bg-amber-100" : "border-neutral-300"
            }`}
          >
            Block
          </button>
          <button
            type="button"
            onClick={() => setMode((current) => (current === "booking" ? "none" : "booking"))}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              mode === "booking" ? "border-emerald-300 bg-emerald-100" : "border-neutral-300"
            }`}
          >
            Booking
          </button>
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className="rounded-lg border px-3 py-1.5 text-sm"
          >
            <option value="all">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.title}
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

      {!loading && data.masters.length > 0 && (!hasServices || !hasAssignedServices) ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Create services and assign them to masters in Services or in the master card.
        </div>
      ) : null}

      {!loading && data.masters.length > 0 ? (
        <div className="overflow-auto rounded-2xl border">
          <table className="w-full min-w-[900px] border-collapse">
            <thead>
              <tr className="bg-neutral-50">
                <th className="border-b p-2 text-left text-xs font-semibold text-neutral-500">Time</th>
                {data.masters.map((master) => (
                  <th key={master.id} className="border-b p-2 text-left text-xs font-semibold text-neutral-700">
                    {master.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hours.map((hour) => (
                <tr key={hour}>
                  <td className="border-b p-2 text-xs text-neutral-500">{`${String(hour).padStart(2, "0")}:00`}</td>
                  {data.masters.map((master) => {
                    const key = `${master.id}:${hour}`;
                    const bookings = (bookingMap.get(key) ?? []).filter((booking) => filteredBookingIds.has(booking.id));
                    const blocks = blockMap.get(key) ?? [];
                    return (
                      <td key={key} className="border-b p-2 align-top">
                        <button
                          type="button"
                          onClick={() => void onSlotClick(master.id, hour)}
                          className="mb-2 block w-full rounded border border-dashed border-neutral-200 px-2 py-1 text-left text-[11px] text-neutral-400 hover:border-neutral-300"
                        >
                          {mode === "block" ? "Click to add block" : mode === "booking" ? "Click to create booking" : "Slot"}
                        </button>
                        <div className="space-y-1">
                          {blocks.map((block) => (
                            <div key={block.id} className="rounded border border-amber-200 bg-amber-50 p-2 text-xs">
                              {block.type}
                            </div>
                          ))}
                          {bookings.map((booking) => (
                            <div key={booking.id} className={`rounded border p-2 text-xs ${statusColor(booking.status)}`}>
                              <div className="font-semibold">{booking.clientName}</div>
                              <div className="text-neutral-600">{booking.status}</div>
                            </div>
                          ))}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {!loading && data.masters.length > 0 && data.bookings.length === 0 && data.blocks.length === 0 ? (
        <div className="rounded-2xl border p-4 text-sm text-neutral-600">
          Calendar is empty. Create services and assign masters first.
        </div>
      ) : null}

      {bookingModal ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border bg-white p-4">
            <h3 className="text-base font-semibold">Create booking</h3>
            <p className="mt-1 text-xs text-neutral-500">
              {date} at {String(bookingModal.hour).padStart(2, "0")}:00
            </p>
            <div className="mt-3 space-y-2">
              <input
                type="text"
                value={bookingClientName}
                onChange={(event) => setBookingClientName(event.target.value)}
                placeholder="Client name"
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
              <input
                type="text"
                value={bookingClientPhone}
                onChange={(event) => setBookingClientPhone(event.target.value)}
                placeholder="Client phone (optional)"
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
              <select
                value={bookingServiceId}
                onChange={(event) => setBookingServiceId(event.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              >
                <option value="">Select service</option>
                {servicesForSelectedMaster.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBookingModal(null)}
                className="rounded-lg border px-3 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void createBooking()}
                disabled={saving}
                className="rounded-lg bg-black px-3 py-2 text-sm text-white disabled:opacity-60"
              >
                {saving ? "Saving..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
