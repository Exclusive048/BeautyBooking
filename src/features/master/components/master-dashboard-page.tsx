"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ApiResponse } from "@/lib/types/api";

type DayBooking = {
  id: string;
  startAt: string | null;
  endAt: string | null;
  status: string;
  clientName: string;
  clientPhone: string;
  notes: string | null;
  serviceTitle: string;
};

type DayGap = {
  startAt: string;
  endAt: string;
  minutes: number;
};

type DayReview = {
  id: string;
  rating: number;
  text: string | null;
  authorName: string;
  createdAt: string;
};

type DayService = {
  id: string;
  title: string;
  price: number;
  durationMin: number;
};

type DayData = {
  date: string;
  isSolo: boolean;
  bookings: DayBooking[];
  currentBookingId: string | null;
  nextBookingId: string | null;
  monthEarnings: number;
  upcomingGaps: DayGap[];
  latestReviews: DayReview[];
  services: DayService[];
};

function todayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function dateShift(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function MasterDashboardPage() {
  const [date, setDate] = useState(todayDateKey());
  const [data, setData] = useState<DayData>({
    date: todayDateKey(),
    isSolo: true,
    bookings: [],
    currentBookingId: null,
    nextBookingId: null,
    monthEarnings: 0,
    upcomingGaps: [],
    latestReviews: [],
    services: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [storyOpen, setStoryOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  const [manualStartAt, setManualStartAt] = useState(`${todayDateKey()}T10:00`);
  const [manualServiceId, setManualServiceId] = useState("");
  const [manualClientName, setManualClientName] = useState("");
  const [manualClientPhone, setManualClientPhone] = useState("");
  const [manualNotes, setManualNotes] = useState("");

  const sortedBookings = useMemo(() => {
    return [...data.bookings].sort((a, b) => {
      if (!a.startAt || !b.startAt) return 0;
      return new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
    });
  }, [data.bookings]);

  const load = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ date });
      const res = await fetch(`/api/master/day?${query.toString()}`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<DayData> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      setData(json.data);
      if (!manualServiceId && json.data.services.length > 0) {
        setManualServiceId(json.data.services[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load day");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const updateStatus = async (
    bookingId: string,
    status: "STARTED" | "NO_SHOW" | "FINISHED"
  ): Promise<void> => {
    setActionId(bookingId);
    setError(null);
    try {
      const res = await fetch(`/api/master/bookings/${bookingId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ id: string; status: string }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      setData((current) => ({
        ...current,
        bookings: current.bookings.map((item) =>
          item.id === bookingId ? { ...item, status: json.data.status } : item
        ),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setActionId(null);
    }
  };

  const createManualBooking = async (): Promise<void> => {
    if (!manualServiceId || !manualClientName.trim() || !manualStartAt) return;
    setSavingManual(true);
    setError(null);
    try {
      const startAtIso = new Date(manualStartAt).toISOString();
      const res = await fetch("/api/master/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startAt: startAtIso,
          serviceId: manualServiceId,
          clientName: manualClientName.trim(),
          clientPhone: manualClientPhone.trim() || undefined,
          notes: manualNotes.trim() || undefined,
        }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ id: string }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      setManualOpen(false);
      setManualClientName("");
      setManualClientPhone("");
      setManualNotes("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create booking");
    } finally {
      setSavingManual(false);
    }
  };

  const downloadStory = (): void => {
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#f7f7f7";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#111111";
    ctx.font = "bold 56px sans-serif";
    ctx.fillText("Окна на сегодня", 80, 180);

    ctx.font = "42px sans-serif";
    data.upcomingGaps.forEach((gap, index) => {
      const start = new Date(gap.startAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const end = new Date(gap.endAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      ctx.fillText(`${start} - ${end} (${gap.minutes} мин)`, 80, 320 + index * 90);
    });

    const link = document.createElement("a");
    link.download = `story-${date}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setDate((d) => dateShift(d, -1))} className="rounded-lg border px-3 py-2 text-sm">
            &lt;
          </button>
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
          />
          <button type="button" onClick={() => setDate((d) => dateShift(d, 1))} className="rounded-lg border px-3 py-2 text-sm">
            &gt;
          </button>
          <button type="button" onClick={() => void load()} className="rounded-lg border px-3 py-2 text-sm">
            Refresh
          </button>
          <Link href="/cabinet/master/schedule" className="rounded-lg border px-3 py-2 text-sm hover:bg-neutral-50">
            Мой график
          </Link>
          <Link href="/cabinet/master/profile" className="rounded-lg border px-3 py-2 text-sm hover:bg-neutral-50">
            Профиль
          </Link>
        </div>
      </div>

      {loading ? <div className="rounded-2xl border p-5 text-sm">Loading...</div> : null}
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      {!loading ? (
        <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-2xl border p-4">
              <h3 className="text-sm font-semibold">Мой день</h3>
              <button
                type="button"
                onClick={() => setManualOpen(true)}
                disabled={!data.isSolo}
                className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
                title={data.isSolo ? "Добавить запись" : "Для студийного мастера пока недоступно"}
              >
                + Записать клиента вручную
              </button>
            </div>

            {sortedBookings.map((booking) => (
              <section
                key={booking.id}
                className={`rounded-2xl border p-4 ${
                  booking.id === data.currentBookingId ? "border-emerald-300 bg-emerald-50" : ""
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{booking.clientName}</div>
                    <div className="text-xs text-neutral-500">{booking.clientPhone}</div>
                    <div className="text-xs text-neutral-500">{booking.serviceTitle}</div>
                  </div>
                  <div className="text-xs text-neutral-600">{booking.status}</div>
                </div>
                {booking.notes ? <div className="mt-2 text-sm text-neutral-700">{booking.notes}</div> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={actionId === booking.id}
                    onClick={() => void updateStatus(booking.id, "STARTED")}
                    className="rounded-lg border px-3 py-1 text-sm"
                  >
                    ✅ Начала
                  </button>
                  <button
                    type="button"
                    disabled={actionId === booking.id}
                    onClick={() => void updateStatus(booking.id, "NO_SHOW")}
                    className="rounded-lg border px-3 py-1 text-sm"
                  >
                    ❌ Не пришла
                  </button>
                  <button
                    type="button"
                    disabled={actionId === booking.id}
                    onClick={() => void updateStatus(booking.id, "FINISHED")}
                    className="rounded-lg border px-3 py-1 text-sm"
                  >
                    🏁 Завершена
                  </button>
                </div>
              </section>
            ))}

            {sortedBookings.length === 0 ? (
              <div className="rounded-2xl border p-5">
                <div className="text-sm font-semibold">Пока нет записей</div>
                <div className="mt-1 text-sm text-neutral-600">Проверьте график и настройте услуги.</div>
              </div>
            ) : null}
          </div>

          <div className="space-y-3">
            <section className="rounded-2xl border p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Мой баланс (месяц)</h3>
                <button type="button" onClick={() => setBalanceVisible((v) => !v)} className="text-sm">
                  {balanceVisible ? "🙈" : "👁️"}
                </button>
              </div>
              <div className={`text-2xl font-semibold ${balanceVisible ? "" : "blur-sm select-none"}`}>
                {data.monthEarnings.toLocaleString("ru-RU")} ₸
              </div>
            </section>

            <section className="rounded-2xl border p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Ближайшие окна</h3>
                <button type="button" onClick={() => setStoryOpen(true)} className="rounded-lg border px-2 py-1 text-xs">
                  Опубликовать в Stories
                </button>
              </div>
              <div className="space-y-1 text-sm text-neutral-700">
                {data.upcomingGaps.length === 0 ? (
                  <div className="text-neutral-500">Свободных окон нет.</div>
                ) : (
                  data.upcomingGaps.map((gap) => {
                    const start = new Date(gap.startAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                    const end = new Date(gap.endAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                    return (
                      <div key={gap.startAt}>
                        {start} - {end} ({gap.minutes} мин)
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            <section className="rounded-2xl border p-4">
              <h3 className="mb-2 text-sm font-semibold">Уведомления (новые отзывы)</h3>
              <div className="space-y-2">
                {data.latestReviews.length === 0 ? (
                  <div className="text-sm text-neutral-500">Пока отзывов нет.</div>
                ) : (
                  data.latestReviews.map((review) => (
                    <div key={review.id} className="rounded-lg border p-2 text-sm">
                      <div className="font-medium">
                        {review.authorName} · ⭐{review.rating}
                      </div>
                      {review.text ? <div className="text-neutral-700">{review.text}</div> : null}
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {storyOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border bg-white p-4">
            <h3 className="text-base font-semibold">Stories preview</h3>
            <div className="mt-3 rounded-xl border bg-neutral-50 p-3 text-sm">
              <div className="font-medium">Окна на {date}</div>
              <div className="mt-2 space-y-1">
                {data.upcomingGaps.map((gap) => {
                  const start = new Date(gap.startAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                  const end = new Date(gap.endAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                  return (
                    <div key={gap.startAt}>
                      {start} - {end} ({gap.minutes} мин)
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setStoryOpen(false)} className="rounded-lg border px-3 py-2 text-sm">
                Закрыть
              </button>
              <button type="button" onClick={downloadStory} className="rounded-lg bg-black px-3 py-2 text-sm text-white">
                Скачать
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {manualOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border bg-white p-4">
            <h3 className="text-base font-semibold">Ручная запись</h3>
            <div className="mt-3 space-y-2">
              <input
                type="datetime-local"
                value={manualStartAt}
                onChange={(event) => setManualStartAt(event.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
              <select
                value={manualServiceId}
                onChange={(event) => setManualServiceId(event.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              >
                <option value="">Выберите услугу</option>
                {data.services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.title} · {service.durationMin} мин · {service.price} ₸
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={manualClientName}
                onChange={(event) => setManualClientName(event.target.value)}
                placeholder="Имя клиента"
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
              <input
                type="text"
                value={manualClientPhone}
                onChange={(event) => setManualClientPhone(event.target.value)}
                placeholder="Телефон"
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
              <textarea
                value={manualNotes}
                onChange={(event) => setManualNotes(event.target.value)}
                placeholder="Комментарий"
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setManualOpen(false)} className="rounded-lg border px-3 py-2 text-sm">
                Отмена
              </button>
              <button
                type="button"
                onClick={() => void createManualBooking()}
                disabled={savingManual}
                className="rounded-lg bg-black px-3 py-2 text-sm text-white disabled:opacity-60"
              >
                {savingManual ? "Сохраняем..." : "Создать"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
