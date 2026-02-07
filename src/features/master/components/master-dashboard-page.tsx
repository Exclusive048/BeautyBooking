"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import type { ApiResponse } from "@/lib/types/api";
import type { MediaAssetDto } from "@/lib/media/types";
import { BOOKING_ACTION_WINDOW_MINUTES } from "@/lib/bookings/flow";

type DayBooking = {
  id: string;
  startAt: string | null;
  endAt: string | null;
  startAtUtc: string | null;
  endAtUtc: string | null;
  proposedStartAt: string | null;
  proposedEndAt: string | null;
  rawStatus: string;
  status: string;
  canNoShow: boolean;
  actionRequiredBy: "CLIENT" | "MASTER" | null;
  requestedBy: "CLIENT" | "MASTER" | null;
  changeComment: string | null;
  clientName: string;
  clientPhone: string;
  notes: string | null;
  silentMode: boolean;
  serviceTitle: string;
  serviceName?: string;
  durationMin?: number;
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

type DayWorkingHours = {
  isDayOff: boolean;
  startLocal: string | null;
  endLocal: string | null;
  bufferBetweenBookingsMin: number;
  timezone: string;
};

type DayData = {
  masterId: string;
  date: string;
  isSolo: boolean;
  workingHours: DayWorkingHours;
  newBookingsCount: number;
  bookings: DayBooking[];
  currentBookingId: string | null;
  nextBookingId: string | null;
  monthEarnings: number;
  upcomingGaps: DayGap[];
  latestReviews: DayReview[];
  services: DayService[];
};

type AvailabilitySlot = {
  startAtUtc: string;
  endAtUtc: string;
  label: string;
};

type DisplayAvailabilitySlot = {
  key: string;
  label: string;
};

function todayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function dateShift(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const moneyFormatter = new Intl.NumberFormat("ru-RU");

function formatMoney(value: number): string {
  return `${moneyFormatter.format(value)} ₽`;
}

function formatSlotLabel(value: string): string {
  const date = new Date(value);
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatBookingStart(value: string | null, timezone: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  });
}

function canMasterRequestMove(booking: DayBooking): boolean {
  if (booking.status !== "CONFIRMED") return false;
  if (booking.actionRequiredBy !== null) return false;
  if (!booking.startAtUtc) return false;
  const minutesLeft = (new Date(booking.startAtUtc).getTime() - Date.now()) / 60000;
  return Number.isFinite(minutesLeft) && minutesLeft >= BOOKING_ACTION_WINDOW_MINUTES;
}

function formatAvailabilitySlot(slot: AvailabilitySlot): string {
  const [datePart, timePart] = slot.label.split(" ");
  if (!datePart || !timePart) {
    return formatSlotLabel(slot.startAtUtc);
  }
  const [year, month, day] = datePart.split("-");
  if (!year || !month || !day) {
    return formatSlotLabel(slot.startAtUtc);
  }
  return `${day}.${month} ${timePart}`;
}

const STORIES_SLOTS_PER_CARD = 10;
const DISPLAY_SLOT_STEP_MS = 60 * 60 * 1000;

export function MasterDashboardPage() {
  const router = useRouter();
  const [date, setDate] = useState(todayDateKey());
  const [data, setData] = useState<DayData>({
    masterId: "",
    date: todayDateKey(),
    isSolo: true,
    workingHours: {
      isDayOff: false,
      startLocal: null,
      endLocal: null,
      bufferBetweenBookingsMin: 0,
      timezone: "Europe/Moscow",
    },
    newBookingsCount: 0,
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
  const [storyGenerating, setStoryGenerating] = useState(false);
  const [storyAssets, setStoryAssets] = useState<MediaAssetDto[]>([]);
  const [storyError, setStoryError] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  const bookingsSeenSentRef = useRef(false);
  const [manualStartAt, setManualStartAt] = useState(`${todayDateKey()}T10:00`);
  const [manualServiceId, setManualServiceId] = useState("");
  const [manualClientName, setManualClientName] = useState("");
  const [manualClientPhone, setManualClientPhone] = useState("");
  const [manualNotes, setManualNotes] = useState("");

  const [slotsServiceId, setSlotsServiceId] = useState("");
  const [freeSlots, setFreeSlots] = useState<AvailabilitySlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [slotsReloadTick, setSlotsReloadTick] = useState(0);

  const sortedBookings = useMemo(() => {
    return [...data.bookings].sort((a, b) => {
      if (!a.startAt || !b.startAt) return 0;
      return new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
    });
  }, [data.bookings]);

  const displayFreeSlots = useMemo<DisplayAvailabilitySlot[]>(() => {
    const result: DisplayAvailabilitySlot[] = [];
    let lastSlotStartMs: number | null = null;

    for (const slot of freeSlots) {
      const slotStartMs = new Date(slot.startAtUtc).getTime();
      if (!Number.isFinite(slotStartMs)) continue;

      const roundedStartMs = Math.ceil(slotStartMs / DISPLAY_SLOT_STEP_MS) * DISPLAY_SLOT_STEP_MS;
      if (lastSlotStartMs !== null && roundedStartMs < lastSlotStartMs + DISPLAY_SLOT_STEP_MS) {
        continue;
      }

      const roundedIso = new Date(roundedStartMs).toISOString();
      result.push({
        key: `${slot.startAtUtc}-${roundedStartMs}`,
        label: formatSlotLabel(roundedIso),
      });
      lastSlotStartMs = roundedStartMs;
    }

    return result;
  }, [freeSlots]);

  const load = async (signal?: AbortSignal): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ date });
      const res = await fetch(`/api/master/day?${query.toString()}`, { cache: "no-store", signal });
      const json = (await res.json().catch(() => null)) as ApiResponse<DayData> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      setData(json.data);
      if (!manualServiceId && json.data.services.length > 0) {
        setManualServiceId(json.data.services[0].id);
      }
      if (!slotsServiceId && json.data.services.length > 0) {
        setSlotsServiceId(json.data.services[0].id);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Не удалось загрузить данные дня");
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  useEffect(() => {
    if (!data.masterId || bookingsSeenSentRef.current) return;
    bookingsSeenSentRef.current = true;

    void (async () => {
      try {
        const res = await fetch("/api/master/bookings/seen", { method: "POST" });
        const json = (await res.json().catch(() => null)) as
          | ApiResponse<{ lastBookingsSeenAt: string }>
          | null;
        if (res.ok && json && json.ok) {
          setData((prev) => ({ ...prev, newBookingsCount: 0 }));
        }
      } catch {
        // Keep dashboard usable even if seen marker update fails.
      }
    })();
  }, [data.masterId]);

  useEffect(() => {
    const controller = new AbortController();
    const loadSlots = async (): Promise<void> => {
      if (!data.masterId || !slotsServiceId) {
        setFreeSlots([]);
        return;
      }

      setSlotsLoading(true);
      setSlotsError(null);
      try {
        const from = new Date(`${date}T00:00:00.000Z`);
        const to = new Date(from);
        to.setUTCDate(to.getUTCDate() + 7);

        const params = new URLSearchParams({
          serviceId: slotsServiceId,
          from: from.toISOString(),
          to: to.toISOString(),
        });
        const res = await fetch(`/api/masters/${data.masterId}/availability?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const json = (await res.json().catch(() => null)) as ApiResponse<{ slots: AvailabilitySlot[] }> | null;

        if (!res.ok || !json || !json.ok) {
          throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
        }

        setFreeSlots(json.data.slots ?? []);
      } catch (slotError) {
        if (slotError instanceof DOMException && slotError.name === "AbortError") return;
        setSlotsError(slotError instanceof Error ? slotError.message : "Не удалось загрузить свободные слоты");
        setFreeSlots([]);
      } finally {
        if (!controller.signal.aborted) {
          setSlotsLoading(false);
        }
      }
    };

    void loadSlots();
    return () => controller.abort();
  }, [data.masterId, date, slotsServiceId, slotsReloadTick]);

  const updateStatus = async (
    booking: DayBooking,
    status: "CONFIRMED" | "REJECTED"
  ): Promise<void> => {
    let comment: string | undefined;
    if (status === "REJECTED") {
      const requiresComment = booking.status !== "CHANGE_REQUESTED";
      const value = window.prompt("Причина отклонения", booking.changeComment ?? "")?.trim();
      if (requiresComment && !value) {
        setError("Комментарий обязателен");
        return;
      }
      comment = value || undefined;
    }

    setActionId(booking.id);
    setError(null);
    try {
      const res = await fetch(`/api/master/bookings/${booking.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          ...(comment ? { comment } : {}),
        }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ id: string; status: string }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось обновить статус");
    } finally {
      setActionId(null);
    }
  };

  const requestReschedule = async (booking: DayBooking): Promise<void> => {
    if (!canMasterRequestMove(booking)) return;
    if (!booking.durationMin || booking.durationMin <= 0) {
      setError("Booking duration is missing");
      return;
    }

    const defaultStart = booking.startAtUtc
      ? new Date(booking.startAtUtc).toISOString().slice(0, 16)
      : "";
    const startInput = window.prompt("New start (YYYY-MM-DDTHH:mm)", defaultStart)?.trim();
    if (!startInput) return;

    const startAt = new Date(startInput);
    if (Number.isNaN(startAt.getTime())) {
      setError("Invalid start time");
      return;
    }

    const comment = window.prompt("Comment for client", booking.changeComment ?? "")?.trim();
    if (!comment) {
      setError("Comment is required");
      return;
    }

    const startAtUtc = startAt.toISOString();
    const endAtUtc = new Date(startAt.getTime() + booking.durationMin * 60 * 1000).toISOString();

    setActionId(booking.id);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${booking.id}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startAtUtc,
          endAtUtc,
          slotLabel: startAtUtc,
          comment,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ booking: { id: string } }>
        | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to request reschedule");
    } finally {
      setActionId(null);
    }
  };

  const getStatusLabel = (status: string): string => {
    if (status === "PENDING" || status === "NEW") return "Awaiting confirmation";
    if (status === "CONFIRMED") return "Confirmed";
    if (status === "CHANGE_REQUESTED") return "Awaiting other side";
    if (status === "IN_PROGRESS" || status === "STARTED") return "In progress";
    if (status === "FINISHED") return "Finished";
    if (status === "REJECTED" || status === "CANCELLED" || status === "NO_SHOW") return "Rejected";
    return status;
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
      setError(err instanceof Error ? err.message : "Не удалось создать запись");
    } finally {
      setSavingManual(false);
    }
  };

  const downloadStory = (): void => {
    setStoryError(null);
    const cards = generateStoryCards();
    cards.forEach((canvas, index) => {
      const link = document.createElement("a");
      link.download = `story-${date}-${index + 1}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    });
  };

  const generateStoryCards = (): HTMLCanvasElement[] => {
    const labels = freeSlots.map((slot) => formatAvailabilitySlot(slot));
    const chunks: string[][] = [];
    for (let i = 0; i < labels.length; i += STORIES_SLOTS_PER_CARD) {
      chunks.push(labels.slice(i, i + STORIES_SLOTS_PER_CARD));
    }
    const pages = chunks.length > 0 ? chunks : [["Свободных слотов нет"]];

    return pages.map((pageSlots, pageIndex) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1920;
      const ctx = canvas.getContext("2d");
      if (!ctx) return canvas;

      ctx.fillStyle = "#101114";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 56px sans-serif";
      ctx.fillText("BeautyHub", 80, 170);
      ctx.font = "42px sans-serif";
      ctx.fillText(`Свободные слоты · ${date}`, 80, 250);

      if (pages.length > 1) {
        ctx.font = "28px sans-serif";
        ctx.fillStyle = "#c8cad0";
        ctx.fillText(`Карточка ${pageIndex + 1}/${pages.length}`, 80, 305);
      }

      ctx.font = "bold 52px sans-serif";
      ctx.fillStyle = "#f2f4f8";
      pageSlots.forEach((slotLabel, slotIndex) => {
        ctx.fillText(slotLabel, 80, 430 + slotIndex * 120);
      });

      return canvas;
    });
  };

  const canvasToFile = (canvas: HTMLCanvasElement, name: string): Promise<File> =>
    new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Не удалось создать изображение"));
          return;
        }
        resolve(new File([blob], name, { type: "image/png" }));
      }, "image/png");
    });

  const uploadStoriesToMedia = async (): Promise<void> => {
    if (!data.masterId) return;
    setStoryGenerating(true);
    setStoryError(null);
    setStoryAssets([]);
    try {
      const cards = generateStoryCards();
      const uploaded: MediaAssetDto[] = [];
      for (let i = 0; i < cards.length; i += 1) {
        const file = await canvasToFile(cards[i], `story-${date}-${i + 1}.png`);
        const formData = new FormData();
        formData.set("file", file);
        formData.set("entityType", "MASTER");
        formData.set("entityId", data.masterId);
        formData.set("kind", "PORTFOLIO");
        const response = await fetch("/api/media", {
          method: "POST",
          body: formData,
        });
        const json = (await response.json().catch(() => null)) as ApiResponse<{ asset: MediaAssetDto }> | null;
        if (!response.ok || !json || !json.ok) {
          throw new Error(json && !json.ok ? json.error.message : `API error: ${response.status}`);
        }
        uploaded.push(json.data.asset);
      }
      setStoryAssets(uploaded);
    } catch (uploadError) {
      setStoryError(uploadError instanceof Error ? uploadError.message : "Не удалось сохранить stories");
    } finally {
      setStoryGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="lux-card rounded-[24px] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setDate((d) => dateShift(d, -1))} className="rounded-lg border border-border-subtle bg-bg-input px-3 py-2 text-sm">
            &lt;
          </button>
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="lux-input rounded-lg px-3 py-2 text-sm"
          />
          <button type="button" onClick={() => setDate((d) => dateShift(d, 1))} className="rounded-lg border border-border-subtle bg-bg-input px-3 py-2 text-sm">
            &gt;
          </button>
          <button type="button" onClick={() => void load()} className="rounded-lg border border-border-subtle bg-bg-input px-2.5 py-2 text-sm" aria-label="Обновить">
            ↻
          </button>
        </div>
      </div>

      {loading ? <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">Загрузка...</div> : null}
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      {!loading ? (
        <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <div className="space-y-3">
            <div className="lux-card rounded-[24px] p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Мой день</h3>
                {data.newBookingsCount > 0 ? (
                  <Badge className="px-2 py-0.5 text-[11px]">{"\u041d\u043e\u0432\u044b\u0435"}: {data.newBookingsCount}</Badge>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setManualOpen(true)}
                disabled={!data.isSolo}
                className="rounded-lg border border-border-subtle bg-bg-input px-3 py-2 text-sm transition hover:bg-bg-card disabled:opacity-50"
                title={data.isSolo ? "Добавить запись" : "Для студийного мастера пока недоступно"}
              >
                + Записать клиента вручную
              </button>
            </div>

            <div className="lux-card rounded-[24px] p-4 text-sm">
              {data.workingHours.isDayOff ? (
                <div className="flex items-center justify-between gap-2">
                  <span>Сегодня выходной</span>
                    <a href="/cabinet/master/schedule" className="text-xs text-primary underline">
                    Изменить
                  </a>
                </div>
              ) : data.workingHours.startLocal && data.workingHours.endLocal ? (
                <div className="flex items-center justify-between gap-2">
                  <span>
                    Рабочее время сегодня: {data.workingHours.startLocal}–{data.workingHours.endLocal} • буфер{" "}
                    {data.workingHours.bufferBetweenBookingsMin} мин
                  </span>
                    <a href="/cabinet/master/schedule" className="text-xs text-primary underline">
                    Изменить
                  </a>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <span>Рабочее время не настроено</span>
                    <a href="/cabinet/master/schedule" className="text-xs text-primary underline">
                    Настроить
                  </a>
                </div>
              )}
            </div>

            {sortedBookings.map((booking) => (
              <section
                key={booking.id}
                className={`rounded-[22px] border border-border-subtle bg-bg-card p-4 ${
                  booking.id === data.currentBookingId ? "border-primary/55 bg-primary/10" : ""
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-semibold">{booking.clientName}</div>
                      {booking.silentMode ? (
                        <Badge className="px-2 py-0.5 text-[11px]">🤫 Тишина</Badge>
                      ) : null}
                    </div>
                    <div className="text-xs text-text-sec">{booking.clientPhone}</div>
                    <div className="text-xs text-text-sec">{booking.serviceTitle}</div>
                    {formatBookingStart(
                      booking.startAtUtc ?? booking.startAt,
                      data.workingHours.timezone
                    ) ? (
                      <div className="text-xs text-text-sec">
                        {formatBookingStart(
                          booking.startAtUtc ?? booking.startAt,
                          data.workingHours.timezone
                        )}
                      </div>
                    ) : null}
                  </div>
                  <div className="text-xs text-text-sec">{getStatusLabel(booking.status)}</div>
                </div>
                {booking.notes ? <div className="mt-2 text-sm text-text-sec">{booking.notes}</div> : null}
                {booking.silentMode ? (
                  <div className="mt-2 text-xs text-text-sec">Режим тишины включён</div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {/* AUDIT (кнопки мастера):
                      - реализовано: PENDING + actionRequiredBy=MASTER => Confirm/Reject.
                      - реализовано: CHANGE_REQUESTED от CLIENT => Confirm move/Reject move.
                      - реализовано частично: в карточке нет ссылки на профиль клиента (только имя/телефон). */}
                  {booking.status === "PENDING" && booking.actionRequiredBy === "MASTER" ? (
                    <>
                      <button
                        type="button"
                        disabled={actionId === booking.id}
                        onClick={() => void updateStatus(booking, "CONFIRMED")}
                        className="rounded-lg border border-border-subtle bg-bg-input px-3 py-1 text-sm transition hover:bg-bg-card"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        disabled={actionId === booking.id}
                        onClick={() => void updateStatus(booking, "REJECTED")}
                        className="rounded-lg border border-border-subtle bg-bg-input px-3 py-1 text-sm transition hover:bg-bg-card"
                      >
                        Reject
                      </button>
                    </>
                  ) : null}
                  {booking.status === "CHANGE_REQUESTED" &&
                  booking.actionRequiredBy === "MASTER" ? (
                    <>
                      <button
                        type="button"
                        disabled={actionId === booking.id}
                        onClick={() => void updateStatus(booking, "CONFIRMED")}
                        className="rounded-lg border border-border-subtle bg-bg-input px-3 py-1 text-sm transition hover:bg-bg-card"
                      >
                        Confirm move
                      </button>
                      <button
                        type="button"
                        disabled={actionId === booking.id}
                        onClick={() => void updateStatus(booking, "REJECTED")}
                        className="rounded-lg border border-border-subtle bg-bg-input px-3 py-1 text-sm transition hover:bg-bg-card"
                      >
                        Reject move
                      </button>
                    </>
                  ) : null}
                  {canMasterRequestMove(booking) ? (
                    <button
                      type="button"
                      disabled={actionId === booking.id}
                      onClick={() => void requestReschedule(booking)}
                      className="rounded-lg border border-border-subtle bg-bg-input px-3 py-1 text-sm transition hover:bg-bg-card"
                    >
                      Request move
                    </button>
                  ) : null}
                </div>
              </section>
            ))}

            {sortedBookings.length === 0 ? (
               <div className="lux-card rounded-[24px] p-5">
                <div className="text-sm font-semibold">Пока нет записей</div>
                <div className="mt-1 text-sm text-text-sec">Проверьте график и настройте услуги.</div>
              </div>
            ) : null}
          </div>

          <div className="space-y-3">
            <section className="lux-card rounded-[24px] p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Мой баланс (месяц)</h3>
                <button type="button" onClick={() => setBalanceVisible((v) => !v)} className="text-sm" aria-label="Скрыть или показать баланс">
                  {balanceVisible ? "🙈" : "👁️"}
                </button>
              </div>
              <div className={`text-2xl font-semibold ${balanceVisible ? "" : "blur-sm select-none"}`}>
                {formatMoney(data.monthEarnings)}
              </div>
            </section>

            <section className="lux-card rounded-[24px] p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Ближайшие свободные слоты</h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSlotsReloadTick((value) => value + 1)}
                    className="rounded-lg border border-border-subtle bg-bg-input px-2 py-1 text-xs"
                    aria-label="Обновить слоты"
                  >
                    ↻
                  </button>
                  <button type="button" onClick={() => setStoryOpen(true)} className="rounded-lg border border-border-subtle bg-bg-input px-2 py-1 text-xs">
                    Опубликовать в Stories
                  </button>
                </div>
              </div>

              {data.services.length > 0 ? (
                <select
                  value={slotsServiceId}
                  onChange={(event) => setSlotsServiceId(event.target.value)}
                  className="lux-input mb-3 w-full rounded-lg px-2 py-1.5 text-xs"
                >
                  {data.services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.title}
                    </option>
                  ))}
                </select>
              ) : null}

              {slotsLoading ? <div className="text-sm text-text-sec">Загрузка слотов...</div> : null}
              {slotsError ? <div className="text-sm text-red-600">{slotsError}</div> : null}
              {!slotsLoading && !slotsError ? (
                displayFreeSlots.length === 0 ? (
                  <div className="text-text-sec">Свободных слотов нет.</div>
                ) : (
                  <div className="max-h-56 space-y-1 overflow-auto text-sm text-text-sec">
                    {displayFreeSlots.map((slot) => (
                      <div key={slot.key} className="rounded-xl border border-border-subtle bg-bg-input/70 px-2 py-1">
                        {slot.label}
                      </div>
                    ))}
                  </div>
                )
              ) : null}
            </section>

            <section className="lux-card rounded-[24px] p-4">
              <h3 className="mb-2 text-sm font-semibold">Уведомления (новые отзывы)</h3>
              <div className="space-y-2">
                {data.latestReviews.length === 0 ? (
                    <div className="text-sm text-text-sec">Пока отзывов нет.</div>
                ) : (
                  data.latestReviews.map((review) => (
                    <button
                      key={review.id}
                      type="button"
                      onClick={() => router.push("/cabinet/master/reviews")}
                      className="w-full rounded-xl border border-border-subtle bg-bg-input/70 p-2 text-left text-sm transition hover:bg-bg-input"
                    >
                      <div className="font-medium">
                        {review.authorName} · ⭐{review.rating}
                      </div>
                      {review.text ? <div className="text-text-sec">{review.text}</div> : null}
                    </button>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {storyOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-[24px] border border-border-subtle bg-bg-card p-4 shadow-hover">
            <h3 className="text-base font-semibold">Stories preview</h3>
            <div className="mt-3 rounded-xl border border-border-subtle bg-bg-input p-3 text-sm">
              <div className="font-medium">Окна на {date}</div>
              <div className="mt-2 space-y-1">
                {freeSlots.length === 0 ? <div>Свободных слотов нет</div> : null}
                {freeSlots.slice(0, STORIES_SLOTS_PER_CARD).map((slot) => (
                  <div key={slot.startAtUtc}>{formatAvailabilitySlot(slot)}</div>
                ))}
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setStoryOpen(false)} className="rounded-lg border border-border-subtle bg-bg-input px-3 py-2 text-sm">
                  Закрыть
                </button>
                <button
                  type="button"
                  onClick={() => void uploadStoriesToMedia()}
                  disabled={storyGenerating}
                  className="rounded-lg border border-border-subtle bg-bg-input px-3 py-2 text-sm disabled:opacity-60"
                >
                  {storyGenerating ? "Сохранение..." : "Сохранить в медиа"}
                </button>
                <button type="button" onClick={downloadStory} className="rounded-lg bg-gradient-to-r from-primary via-primary-hover to-primary-magenta px-3 py-2 text-sm text-[rgb(var(--accent-foreground))]">
                  Скачать
                </button>
              </div>
            {storyError ? <div className="mt-3 text-sm text-red-600">{storyError}</div> : null}
            {storyAssets.length > 0 ? (
              <div className="mt-4 space-y-2">
                <div className="text-sm font-medium">Сохраненные карточки</div>
                <div className="grid grid-cols-2 gap-2">
                  {storyAssets.map((asset) => (
                    <a
                      key={asset.id}
                      href={asset.url}
                      target="_blank"
                      rel="noreferrer"
                      className="overflow-hidden rounded-xl border border-border-subtle"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={asset.url} alt="Story card" className="h-40 w-full object-cover" />
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {manualOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-[24px] border border-border-subtle bg-bg-card p-4 shadow-hover">
            <h3 className="text-base font-semibold">Ручная запись</h3>
            <div className="mt-3 space-y-2">
              <input
                type="datetime-local"
                value={manualStartAt}
                onChange={(event) => setManualStartAt(event.target.value)}
                className="lux-input w-full rounded-lg px-3 py-2 text-sm"
              />
              <select
                value={manualServiceId}
                onChange={(event) => setManualServiceId(event.target.value)}
                className="lux-input w-full rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Выберите услугу</option>
                {data.services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.title} · {service.durationMin} мин · {formatMoney(service.price)}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={manualClientName}
                onChange={(event) => setManualClientName(event.target.value)}
                placeholder="Имя клиента"
                className="lux-input w-full rounded-lg px-3 py-2 text-sm"
              />
              <input
                type="text"
                value={manualClientPhone}
                onChange={(event) => setManualClientPhone(event.target.value)}
                placeholder="Телефон"
                className="lux-input w-full rounded-lg px-3 py-2 text-sm"
              />
              <textarea
                value={manualNotes}
                onChange={(event) => setManualNotes(event.target.value)}
                placeholder="Комментарий"
                className="lux-input w-full rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setManualOpen(false)} className="rounded-lg border border-border-subtle bg-bg-input px-3 py-2 text-sm">
                Отмена
              </button>
              <button
                type="button"
                onClick={() => void createManualBooking()}
                disabled={savingManual}
                className="rounded-lg bg-gradient-to-r from-primary via-primary-hover to-primary-magenta px-3 py-2 text-sm text-[rgb(var(--accent-foreground))] disabled:opacity-60"
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
