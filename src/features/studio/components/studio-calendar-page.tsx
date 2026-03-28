"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tabs } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { MasterScheduleEditor } from "@/features/cabinet/master/schedule/master-schedule-editor";
import type { ApiResponse } from "@/lib/types/api";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";
import { BookingChat } from "@/features/chat/components/booking-chat";

type CalendarView = "day" | "week" | "month";

type CalendarMaster = {
  id: string;
  name: string;
  isActive: boolean;
  avatarUrl: string | null;
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
  if (status === "CONFIRMED" || status === "PREPAID") {
    return "border-emerald-300/70 bg-emerald-100/65 text-emerald-900";
  }
  if (status === "CANCELLED" || status === "NO_SHOW") {
    return "border-border-subtle bg-bg-input text-text-sec";
  }
  return "border-primary/45 bg-primary/12 text-text-main";
}

function timeRangeLabel(startAt: string | null, endAt: string | null, timeZone: string, fallback = "\u2014"): string {
  if (!startAt || !endAt) return fallback;
  const start = UI_FMT.timeShort(startAt, { timeZone });
  const end = UI_FMT.timeShort(endAt, { timeZone });
  return `${start}\u2014${end}`;
}

function dayLabel(dateKey: string, timeZone: string): string {
  return new Date(`${dateKey}T00:00:00.000Z`).toLocaleDateString("ru-RU", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone,
  });
}

function masterInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "M";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
}

function buildMasterScheduleApiPath(studioId: string, masterId: string): string {
  const params = new URLSearchParams({ studioId, masterId });
  return `/api/cabinet/master/schedule?${params.toString()}`;
}

function CalendarBookingChat({ bookingId }: { bookingId: string }) {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  return (
    <div className="mt-2 rounded-xl border border-border-subtle bg-bg-input/40 p-2">
      <Button
        variant="wrapper"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between text-xs font-medium"
      >
        <span>Чат</span>
        {unreadCount > 0 ? <Badge className="px-2 py-0.5 text-[10px]">{unreadCount}</Badge> : null}
      </Button>
      {open ? (
        <div className="mt-2">
          <BookingChat bookingId={bookingId} currentRole="MASTER" onUnreadCountChange={setUnreadCount} />
        </div>
      ) : null}
    </div>
  );
}
export function StudioCalendarPage({ studioId }: Props) {
  const t = UI_TEXT.studioCabinet.calendar;
  const viewerTimeZone = useViewerTimeZoneContext();
  const [panel, setPanel] = useState<"calendar" | "schedule">("calendar");
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
  const [activeScheduleMasterId, setActiveScheduleMasterId] = useState<string | null>(null);
  const [visitedScheduleMasterIds, setVisitedScheduleMasterIds] = useState<string[]>([]);

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
          calendarJson && !calendarJson.ok
            ? calendarJson.error.message
            : `${t.apiErrorPrefix}: ${calendarRes.status}`
        );
      }

      const servicesJson = (await servicesRes.json().catch(() => null)) as ApiResponse<ServicesData> | null;
      if (!servicesRes.ok || !servicesJson || !servicesJson.ok) {
        throw new Error(
          servicesJson && !servicesJson.ok
            ? servicesJson.error.message
            : `${t.apiErrorPrefix}: ${servicesRes.status}`
        );
      }

      setData(calendarJson.data);
      setServicesData(servicesJson.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.loadFailed);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load is recreated each render, only re-fetch on data deps
  }, [studioId, date, view, t.loadFailed]);

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

  useEffect(() => {
    if (data.masters.length === 0) {
      setActiveScheduleMasterId(null);
      setVisitedScheduleMasterIds([]);
      return;
    }
    setActiveScheduleMasterId((current) => {
      if (current && data.masters.some((master) => master.id === current)) {
        return current;
      }
      return data.masters[0].id;
    });
    setVisitedScheduleMasterIds((current) => {
      const available = new Set(data.masters.map((master) => master.id));
      return current.filter((id) => available.has(id));
    });
  }, [data.masters]);

  useEffect(() => {
    if (!activeScheduleMasterId) return;
    setVisitedScheduleMasterIds((current) =>
      current.includes(activeScheduleMasterId) ? current : [...current, activeScheduleMasterId]
    );
  }, [activeScheduleMasterId]);

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

  const mastersById = useMemo(() => new Map(data.masters.map((master) => [master.id, master])), [data.masters]);
  const activeScheduleMaster = activeScheduleMasterId ? mastersById.get(activeScheduleMasterId) ?? null : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          items={[
            { id: "calendar", label: "Календарь" },
            { id: "schedule", label: "График" },
          ]}
          value={panel}
          onChange={(value) => setPanel(value as "calendar" | "schedule")}
        />
      </div>

      {panel === "schedule" ? (
        <>
          {loading ? <div className="lux-card rounded-[24px] p-6 text-sm text-text-sec">{t.loading}</div> : null}
          {error ? <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-300">{error}</div> : null}

          {!loading && data.masters.length === 0 ? (
            <div className="lux-card rounded-[24px] p-5">
              <h3 className="text-base font-semibold">{t.noMasters}</h3>
              <p className="mt-1 text-sm text-text-sec">Выберите мастера и настройте его личный график.</p>
              <Link
                href="/cabinet/studio/team"
                className="mt-3 inline-flex rounded-lg border border-border-subtle bg-bg-input px-3 py-2 text-sm hover:bg-bg-card"
              >
                {t.goToTeam}
              </Link>
            </div>
          ) : null}

          {!loading && data.masters.length > 0 ? (
            <div className="space-y-4">
              <section className="lux-card rounded-[24px] p-4">
                <header className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold text-text-main">График мастеров студии</h3>
                    <p className="mt-1 text-sm text-text-sec">Выберите мастера и настройте его личный график.</p>
                  </div>
                  {activeScheduleMaster ? (
                    <div className="text-xs text-text-sec">
                      Редактируете: <span className="font-medium text-text-main">{activeScheduleMaster.name}</span>
                    </div>
                  ) : null}
                </header>

                <div className="mt-3 overflow-x-auto pb-1">
                  <div className="flex min-w-max gap-2 pr-1">
                    {data.masters.map((master) => {
                      const isActive = master.id === activeScheduleMasterId;
                      return (
                        <Button
                          key={master.id}
                          variant="secondary"
                          size="none"
                          onClick={() => setActiveScheduleMasterId(master.id)}
                          aria-pressed={isActive}
                          className={`w-[116px] shrink-0 rounded-2xl border px-3 py-3 text-center transition-all ${
                            isActive
                              ? "border-primary/45 bg-primary/10 shadow-card"
                              : "border-border-subtle bg-bg-input/50 hover:bg-bg-card"
                          }`}
                        >
                          <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-border-subtle bg-bg-card text-sm font-semibold text-text-main">
                            {master.avatarUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element -- small avatar (44px), cabinet-only view
                              <img src={master.avatarUrl} alt={master.name} className="h-full w-full object-cover" />
                            ) : (
                              <span>{masterInitials(master.name)}</span>
                            )}
                          </div>
                          <div className="truncate text-sm font-medium text-text-main">{master.name}</div>
                          <div className={`mt-1 text-[11px] ${master.isActive ? "Профиль опубликован" : "Профиль скрыт"}`}>
                            {master.isActive ? "Профиль опубликован" : "Профиль скрыт"}
                          </div>
                        </Button>
                      );
                    })}
                  </div>
                </div>

                <p className="mt-3 text-xs text-text-sec">
                  Черновик изменений хранится отдельно для каждого мастера, пока вы не нажмёте сохранение в его графике.
                </p>
              </section>

              <section className="space-y-3">
                {visitedScheduleMasterIds.map((masterId) => {
                  const master = mastersById.get(masterId);
                  if (!master) return null;
                  const isActive = master.id === activeScheduleMasterId;

                  return (
                    <div key={master.id} className={isActive ? "block" : "hidden"}>
                      <div className="rounded-2xl border border-border-subtle bg-bg-input/50 px-3 py-2 text-sm text-text-sec">
                        Расписание мастера: <span className="font-medium text-text-main">{master.name}</span>
                      </div>
                      <div className="mt-3">
                        <MasterScheduleEditor apiPath={buildMasterScheduleApiPath(studioId, master.id)} />
                      </div>
                    </div>
                  );
                })}
              </section>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div className="lux-card rounded-[24px] p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="rounded-xl px-3 py-2 text-sm"
              />
              <div className="inline-flex rounded-2xl border border-border-subtle bg-bg-input p-1">
                {(["day", "week", "month"] as const).map((item) => (
                  <Button
                    key={item}
                    variant="secondary"
                    size="none"
                    onClick={() => setView(item)}
                    className={`rounded-xl px-3 py-2 text-sm transition-all ${
                      view === item
                        ? "bg-bg-card text-text-main shadow-card"
                        : "text-text-sec hover:bg-bg-card/80 hover:text-text-main"
                    }`}
                  >
                    {item === "day" ? t.day : item === "week" ? t.week : t.month}
                  </Button>
                ))}
              </div>
              <Input
                type="search"
                placeholder={t.searchPlaceholder}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="min-w-[220px] rounded-xl px-3 py-2 text-sm"
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Select
                value={masterFilter}
                onChange={(event) => setMasterFilter(event.target.value)}
                className="rounded-xl px-3 py-1.5 text-sm"
              >
                <option value="all">{t.allMasters}</option>
                {data.masters.map((master) => (
                  <option key={master.id} value={master.id}>
                    {master.name}
                  </option>
                ))}
              </Select>
              <Select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="rounded-xl px-3 py-1.5 text-sm"
              >
                <option value="all">{t.allCategories}</option>
                {servicesData.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.title}
                  </option>
                ))}
              </Select>
              <Select
                value={serviceFilter}
                onChange={(event) => setServiceFilter(event.target.value)}
                className="rounded-xl px-3 py-1.5 text-sm"
              >
                <option value="all">{t.allServices}</option>
                {serviceOptions.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.title}
                  </option>
                ))}
              </Select>
              <Select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="rounded-xl px-3 py-1.5 text-sm"
              >
                <option value="all">{t.allStatuses}</option>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </Select>
            </div>
          </div>

      {loading ? <div className="lux-card rounded-[24px] p-6 text-sm text-text-sec">{t.loading}</div> : null}
      {error ? <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-300">{error}</div> : null}

          {!loading && data.masters.length === 0 ? (
        <div className="lux-card rounded-[24px] p-5">
          <h3 className="text-base font-semibold">{t.noMasters}</h3>
          <p className="mt-1 text-sm text-text-sec">{t.noMastersHint}</p>
          <Link href="/cabinet/studio/team" className="mt-3 inline-flex rounded-lg border border-border-subtle bg-bg-input px-3 py-2 text-sm hover:bg-bg-card">
            {t.goToTeam}
          </Link>
        </div>
      ) : null}

          {!loading && data.masters.length > 0 && view === "month" ? (
        <div className="lux-card rounded-[24px] p-3">
          <div className="grid grid-cols-7 gap-2 text-center text-xs text-text-sec">
            {[t.weekdays.mon, t.weekdays.tue, t.weekdays.wed, t.weekdays.thu, t.weekdays.fri, t.weekdays.sat, t.weekdays.sun].map((day) => (
              <div key={day}>{day}</div>
            ))}
          </div>
          <div className="mt-2 rounded-2xl bg-border-subtle/35 p-2">
            <div className="grid grid-cols-7 gap-2">
            {dayKeys.map((dayKey) => {
              const dayDate = fromDateKey(dayKey);
              const isCurrentMonth =
                dayDate.getUTCMonth() === activeMonth && dayDate.getUTCFullYear() === activeYear;
              const bookingsCount = bookingsByDay.get(dayKey)?.length ?? 0;
              const blocksCount = blocksByDay.get(dayKey)?.length ?? 0;
              return (
                <Button
                  key={dayKey}
                  variant="wrapper"
                  onClick={() => setMonthDetailsDay(dayKey)}
                  className={`min-h-[92px] rounded-2xl border border-border-subtle/70 p-2 text-left transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card ${
                    isCurrentMonth ? "bg-bg-card" : "bg-bg-input text-text-sec"
                  }`}
                >
                  <div className="text-xs font-medium">{dayDate.getUTCDate()}</div>
                  <div className="mt-2 space-y-1 text-[11px]">
                    {bookingsCount > 0 ? (
                      <div className="rounded-full bg-primary/14 px-2 py-1 text-text-main">{bookingsCount}</div>
                    ) : null}
                    {blocksCount > 0 ? (
                      <div className="rounded-full bg-bg-input px-2 py-1 text-text-sec">{t.blocksLabel}: {blocksCount}</div>
                    ) : null}
                  </div>
                </Button>
              );
            })}
            </div>
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
              <section key={dayKey} className="lux-card rounded-[24px] p-4">
                <header className="mb-3 text-sm font-semibold">{dayLabel(dayKey, viewerTimeZone)}</header>
                <div className="space-y-2">
                  {bookings.map((booking) => (
                    <article key={booking.id} className={`rounded-2xl border p-3 text-sm ${statusClass(booking.status)}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-medium">{booking.clientName}</div>
                        <div className="text-xs">{timeRangeLabel(booking.startAt, booking.endAt, viewerTimeZone)}</div>
                      </div>
                      <div className="mt-1 text-xs">
                        {booking.status} • {booking.serviceTitle} • {booking.clientPhone}
                      </div>
                      <CalendarBookingChat bookingId={booking.id} />
                    </article>
                  ))}
                  {blocks.map((block) => (
                    <article key={block.id} className="rounded-2xl border border-border-subtle bg-bg-input p-3 text-sm text-text-sec">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium">{block.type}</div>
                        <div className="text-xs">
                          {timeRangeLabel(block.startAt, block.endAt, viewerTimeZone)}
                        </div>
                      </div>
                    </article>
                  ))}
                  {bookings.length === 0 && blocks.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border-subtle p-3 text-sm text-text-sec">{t.noItemsForDay}</div>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      ) : null}

          {monthDetailsDay ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-[24px] border border-border-subtle bg-bg-card p-4 shadow-hover">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold">{t.dayDetails} — {dayLabel(monthDetailsDay, viewerTimeZone)}</h3>
              <Button variant="secondary" size="sm" onClick={() => setMonthDetailsDay(null)}>
                {UI_TEXT.common.close}
              </Button>
            </div>
            <div className="mt-3 space-y-2">
              {monthDayDetails.bookings.map((booking) => (
                <article key={booking.id} className={`rounded-2xl border p-3 text-sm ${statusClass(booking.status)}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium">{booking.clientName}</div>
                    <div className="text-xs">{timeRangeLabel(booking.startAt, booking.endAt, viewerTimeZone)}</div>
                  </div>
                  <div className="mt-1 text-xs">
                    {booking.status} • {booking.serviceTitle} • {booking.clientPhone}
                  </div>
                  <CalendarBookingChat bookingId={booking.id} />
                </article>
              ))}
              {monthDayDetails.blocks.map((block) => (
                <article key={block.id} className="rounded-2xl border border-border-subtle bg-bg-input p-3 text-sm text-text-sec">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{block.type}</div>
                    <div className="text-xs">{timeRangeLabel(block.startAt, block.endAt, viewerTimeZone)}</div>
                  </div>
                </article>
              ))}
              {monthDayDetails.bookings.length === 0 && monthDayDetails.blocks.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border-subtle p-3 text-sm text-text-sec">{t.noItemsForDay}</div>
              ) : null}
            </div>
          </div>
        </div>
          ) : null}
        </>
      )}
    </div>
  );
}
