"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";
import type { ApiResponse } from "@/lib/types/api";
import type { MediaAssetDto } from "@/lib/media/types";
import { BOOKING_ACTION_WINDOW_MINUTES } from "@/lib/bookings/flow";
import { UI_FMT } from "@/lib/ui/fmt";
import { BookingChat } from "@/features/chat/components/booking-chat";
import { MasterAdvisorSection } from "@/features/master/components/master-advisor-section";
import { UI_TEXT } from "@/lib/ui/text";

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

  referencePhotoAssetId: string | null;

  bookingAnswers: Array<{ questionId: string; questionText: string; answer: string }> | null;
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

type DashboardFreeSlot = {
  time: string;
  startsAt: string;
  categoryId: string;
  categoryName: string;
  maxFitDuration: number;
  allFit: boolean;
  serviceId: string | null;
};

type DashboardFreeSlotsResponse = {
  date: string;
  timezone: string;
  slots: DashboardFreeSlot[];
};

type DisplayFreeSlotHour = {
  key: string;
  time: string;
  startsAt: string;
  slots: DashboardFreeSlot[];
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
  return `${moneyFormatter.format(value)} ${UI_TEXT.common.currencyRub}`;
}

function formatBookingStart(value: string | null, timezone: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return UI_FMT.dateTimeShort(value, { timeZone: timezone });
}

function canMasterRequestMove(booking: DayBooking): boolean {
  if (booking.status !== "CONFIRMED") return false;
  if (booking.actionRequiredBy !== null) return false;
  if (!booking.startAtUtc) return false;
  const minutesLeft = (new Date(booking.startAtUtc).getTime() - Date.now()) / 60000;
  return Number.isFinite(minutesLeft) && minutesLeft >= BOOKING_ACTION_WINDOW_MINUTES;
}

const STORIES_SLOTS_PER_CARD = 10;

function toDateTimeLocalInputValue(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return `${todayDateKey()}T10:00`;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function MasterDashboardPage() {
  const router = useRouter();
  const viewerTimeZone = useViewerTimeZoneContext();
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
  const manualQueryHandledRef = useRef(false);
  const chatQueryHandledRef = useRef(false);
  const chatScrollHandledRef = useRef(false);
  const searchParams = useSearchParams();
  const [manualStartAt, setManualStartAt] = useState(`${todayDateKey()}T10:00`);
  const [manualServiceId, setManualServiceId] = useState("");
  const [manualClientName, setManualClientName] = useState("");
  const [manualClientPhone, setManualClientPhone] = useState("");
  const [manualNotes, setManualNotes] = useState("");

  const [chatOpenMap, setChatOpenMap] = useState<Record<string, boolean>>({});
  const [chatUnreadMap, setChatUnreadMap] = useState<Record<string, number>>({});

  const [freeSlots, setFreeSlots] = useState<DashboardFreeSlot[]>([]);
  const [freeSlotsDate, setFreeSlotsDate] = useState(new Date().toISOString());
  const [freeSlotsTimezone, setFreeSlotsTimezone] = useState("Europe/Moscow");
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [slotsReloadTick, setSlotsReloadTick] = useState(0);

  const sortedBookings = useMemo(() => {
    return [...data.bookings].sort((a, b) => {
      const aTime = a.startAtUtc ? new Date(a.startAtUtc).getTime() : 0;
      const bTime = b.startAtUtc ? new Date(b.startAtUtc).getTime() : 0;
      return aTime - bTime;
    });
  }, [data.bookings]);

  const displayFreeSlots = useMemo<DisplayFreeSlotHour[]>(() => {
    const byHour = new Map<string, DisplayFreeSlotHour>();
    for (const slot of freeSlots) {
      const existing = byHour.get(slot.time);
      if (existing) {
        existing.slots.push(slot);
        continue;
      }

      byHour.set(slot.time, {
        key: slot.time,
        time: slot.time,
        startsAt: slot.startsAt,
        slots: [slot],
      });
    }

    return Array.from(byHour.values())
      .sort((a, b) => a.time.localeCompare(b.time))
      .map((group) => ({
        ...group,
        slots: group.slots.slice().sort((a, b) => a.categoryName.localeCompare(b.categoryName, "ru")),
      }));
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
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : UI_TEXT.master.dashboard.errors.loadDay);
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
    if (manualQueryHandledRef.current) return;
    const manual = searchParams.get("manual");
    if (manual !== "1") return;
    manualQueryHandledRef.current = true;
    const dateParam = searchParams.get("date");
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      setDate(dateParam);
      setManualStartAt(`${dateParam}T10:00`);
    }
    setManualOpen(true);
  }, [searchParams]);

  useEffect(() => {
    if (chatQueryHandledRef.current) return;
    const bookingId = searchParams.get("bookingId");
    const chat = searchParams.get("chat");
    if (chat !== "open" || !bookingId) return;
    chatQueryHandledRef.current = true;
    setChatOpenMap((prev) => ({ ...prev, [bookingId]: true }));
  }, [searchParams]);

  useEffect(() => {
    const bookingId = searchParams.get("bookingId");
    const chat = searchParams.get("chat");
    if (chat !== "open" || !bookingId) return;
    if (chatScrollHandledRef.current) return;
    const target = document.getElementById(`booking-${bookingId}`);
    if (!target) return;
    chatScrollHandledRef.current = true;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [searchParams, data.bookings.length]);

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
      if (!data.masterId) {
        setFreeSlots([]);
        return;
      }

      setSlotsLoading(true);
      setSlotsError(null);
      try {
        const res = await fetch("/api/cabinet/master/dashboard/free-slots", {
          cache: "no-store",
          signal: controller.signal,
        });
        const json = (await res.json().catch(() => null)) as
          | ApiResponse<DashboardFreeSlotsResponse>
          | null;

        if (!res.ok || !json || !json.ok) {
          throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
        }

        setFreeSlots(json.data.slots ?? []);
        setFreeSlotsDate(json.data.date);
        setFreeSlotsTimezone(json.data.timezone);
      } catch (slotError) {
        if (slotError instanceof DOMException && slotError.name === "AbortError") return;
        setSlotsError(slotError instanceof Error ? slotError.message : UI_TEXT.master.dashboard.errors.loadSlots);
        setFreeSlots([]);
      } finally {
        if (!controller.signal.aborted) {
          setSlotsLoading(false);
        }
      }
    };

    void loadSlots();
    return () => controller.abort();
  }, [data.masterId, slotsReloadTick]);

  const updateStatus = async (
    booking: DayBooking,
    status: "CONFIRMED" | "REJECTED"
  ): Promise<void> => {
    let comment: string | undefined;
    if (status === "REJECTED") {
      const requiresComment = booking.status !== "CHANGE_REQUESTED";
      const value = window.prompt(UI_TEXT.master.dashboard.prompts.rejectReason, booking.changeComment ?? "")?.trim();
      if (requiresComment && !value) {
        setError(UI_TEXT.master.dashboard.errors.commentRequired);
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
      setError(err instanceof Error ? err.message : UI_TEXT.master.dashboard.errors.updateStatus);
    } finally {
      setActionId(null);
    }
  };

  const requestReschedule = async (booking: DayBooking): Promise<void> => {
    if (!canMasterRequestMove(booking)) return;
    if (!booking.durationMin || booking.durationMin <= 0) {
      setError(UI_TEXT.master.dashboard.errors.bookingDurationUnknown);
      return;
    }

    const defaultStart = booking.startAtUtc
      ? new Date(booking.startAtUtc).toISOString().slice(0, 16)
      : "";
    const startInput = window.prompt(UI_TEXT.master.dashboard.prompts.rescheduleStart, defaultStart)?.trim();
    if (!startInput) return;

    const startAt = new Date(startInput);
    if (Number.isNaN(startAt.getTime())) {
      setError(UI_TEXT.master.dashboard.errors.invalidStartDateTime);
      return;
    }

    const comment = window.prompt(UI_TEXT.master.dashboard.prompts.clientComment, booking.changeComment ?? "")?.trim();
    if (!comment) {
      setError(UI_TEXT.master.dashboard.errors.commentRequired);
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
      setError(err instanceof Error ? err.message : UI_TEXT.master.dashboard.errors.sendRescheduleRequest);
    } finally {
      setActionId(null);
    }
  };

  const toggleChat = (id: string) => {
    setChatOpenMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleUnreadChange = (id: string, count: number) => {
    setChatUnreadMap((prev) => (prev[id] === count ? prev : { ...prev, [id]: count }));
  };

  const formatFreeSlotDuration = (slot: DashboardFreeSlot): string => {
    const template = slot.allFit
      ? UI_TEXT.master.dashboard.freeSlots.allFit
      : UI_TEXT.master.dashboard.freeSlots.partialFit;
    return template.replace("{duration}", String(slot.maxFitDuration));
  };

  const openManualBookingFromFreeSlot = (slot: DashboardFreeSlot): void => {
    if (!data.isSolo) return;

    if (slot.serviceId) {
      setManualServiceId(slot.serviceId);
    } else if (!manualServiceId && data.services.length > 0) {
      setManualServiceId(data.services[0].id);
    }

    setManualStartAt(toDateTimeLocalInputValue(slot.startsAt));
    setManualOpen(true);
  };

  const getStatusLabel = (status: string): string => {
    if (status === "PENDING" || status === "NEW") return UI_TEXT.master.dashboard.status.pending;
  if (status === "CONFIRMED") return UI_TEXT.master.dashboard.status.confirmed;
    if (status === "CHANGE_REQUESTED") return UI_TEXT.master.dashboard.status.changeRequested;
    if (status === "IN_PROGRESS" || status === "STARTED") return UI_TEXT.master.dashboard.status.inProgress;
    if (status === "FINISHED") return UI_TEXT.master.dashboard.status.finished;
  if (status === "REJECTED" || status === "CANCELLED" || status === "NO_SHOW") {
    return UI_TEXT.master.dashboard.status.rejected;
  }
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
      setError(err instanceof Error ? err.message : UI_TEXT.master.dashboard.errors.createBooking);
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
    const labels = displayFreeSlots.map((hour) => {
      const categories = hour.slots
        .map((slot) => `${slot.categoryName} (${formatFreeSlotDuration(slot)})`)
        .join(", ");
      return `${hour.time} - ${categories}`;
    });
    const chunks: string[][] = [];
    for (let i = 0; i < labels.length; i += STORIES_SLOTS_PER_CARD) {
      chunks.push(labels.slice(i, i + STORIES_SLOTS_PER_CARD));
    }
    const pages = chunks.length > 0 ? chunks : [[UI_TEXT.master.dashboard.labels.noSlots]];

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
      ctx.fillText(UI_TEXT.master.dashboard.stories.brand, 80, 170);
      ctx.font = "42px sans-serif";
      ctx.fillText(
        UI_TEXT.master.dashboard.stories.slotsTitle.replace(
          "{date}",
          UI_FMT.dateShort(freeSlotsDate, { timeZone: freeSlotsTimezone })
        ),
        80,
        250
      );

      if (pages.length > 1) {
        ctx.font = "28px sans-serif";
        ctx.fillStyle = "#c8cad0";
        ctx.fillText(
          UI_TEXT.master.dashboard.stories.cardTitle
            .replace("{index}", String(pageIndex + 1))
            .replace("{total}", String(pages.length)),
          80,
          305
        );
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
          reject(new Error(UI_TEXT.master.dashboard.errors.createImage));
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
      setStoryError(uploadError instanceof Error ? uploadError.message : UI_TEXT.master.dashboard.errors.saveStories);
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
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-border-subtle bg-bg-input px-2.5 py-2 text-sm"
            aria-label={UI_TEXT.master.dashboard.labels.refresh}
          >
            {UI_TEXT.master.dashboard.labels.refresh}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">{UI_TEXT.status.loading}</div>
      ) : null}
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      {!loading ? (
        <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <div className="space-y-3">
            <div className="lux-card rounded-[24px] p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{UI_TEXT.master.dashboard.labels.dayTitle}</h3>
                {data.newBookingsCount > 0 ? (
                  <Badge className="px-2 py-0.5 text-[11px]">
                    {UI_TEXT.master.dashboard.labels.newBookings}: {data.newBookingsCount}
                  </Badge>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setManualOpen(true)}
                disabled={!data.isSolo}
                className="rounded-lg border border-border-subtle bg-bg-input px-3 py-2 text-sm transition hover:bg-bg-card disabled:opacity-50"
                title={
                  data.isSolo
                    ? UI_TEXT.master.dashboard.labels.addBooking
                    : UI_TEXT.master.dashboard.labels.addBookingDisabled
                }
              >
                {UI_TEXT.master.dashboard.labels.manualBookingButton}
              </button>
            </div>

            <div className="lux-card rounded-[24px] p-4 text-sm">
              {data.workingHours.isDayOff ? (
                <div className="flex items-center justify-between gap-2">
                  <span>{UI_TEXT.master.dashboard.labels.todayOff}</span>
                  <a href="/cabinet/master/schedule" className="text-xs text-primary underline">
                    {UI_TEXT.master.dashboard.labels.change}
                  </a>
                </div>
              ) : data.workingHours.startLocal && data.workingHours.endLocal ? (
                <div className="flex items-center justify-between gap-2">
                  <span>
                    {UI_TEXT.master.dashboard.labels.workingHoursToday
                      .replace("{start}", data.workingHours.startLocal)
                      .replace("{end}", data.workingHours.endLocal)
                      .replace("{buffer}", String(data.workingHours.bufferBetweenBookingsMin))
                      .replace("{minutes}", UI_TEXT.common.minutesShort)}
                  </span>
                  <a href="/cabinet/master/schedule" className="text-xs text-primary underline">
                    {UI_TEXT.master.dashboard.labels.change}
                  </a>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <span>{UI_TEXT.master.dashboard.labels.workingHoursNotSet}</span>
                  <a href="/cabinet/master/schedule" className="text-xs text-primary underline">
                    {UI_TEXT.master.dashboard.labels.setup}
                  </a>
                </div>
              )}
            </div>

            {sortedBookings.map((booking) => (
              <section
                key={booking.id}
                id={`booking-${booking.id}`}
                className={`rounded-[22px] border border-border-subtle bg-bg-card p-4 ${
                  booking.id === data.currentBookingId ? "border-primary/55 bg-primary/10" : ""
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-semibold">{booking.clientName}</div>
                      {booking.silentMode ? (
                        <Badge className="px-2 py-0.5 text-[11px]">
                          {UI_TEXT.master.dashboard.labels.silenceBadge}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="text-xs text-text-sec">{booking.clientPhone}</div>
                    <div className="text-xs text-text-sec">{booking.serviceTitle}</div>
                    {formatBookingStart(booking.startAtUtc, viewerTimeZone) ? (
                      <div className="text-xs text-text-sec">
                        {formatBookingStart(booking.startAtUtc, viewerTimeZone)}
                      </div>
                    ) : null}
                  </div>
                  <div className="text-xs text-text-sec">{getStatusLabel(booking.status)}</div>
                </div>
                {booking.notes ? <div className="mt-2 text-sm text-text-sec">{booking.notes}</div> : null}
                {booking.silentMode ? (
                  <div className="mt-2 text-xs text-text-sec">{UI_TEXT.master.dashboard.silentModeEnabled}</div>
                ) : null}

                {booking.referencePhotoAssetId || (booking.bookingAnswers?.length ?? 0) > 0 ? (
                  <div className="mt-3 rounded-xl border border-border-subtle bg-bg-input/70 p-3 text-xs text-text-sec">
                    <div className="text-xs font-semibold text-text-main">
                      {UI_TEXT.master.dashboard.bookingQuestionsTitle}
                    </div>
                    {booking.referencePhotoAssetId ? (
                      <a
                        href={`/api/media/file/${booking.referencePhotoAssetId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 block"
                      >
                        <div className="relative h-52 w-full overflow-hidden rounded-xl">
                          <Image
                            src={`/api/media/file/${booking.referencePhotoAssetId}`}
                            alt={UI_TEXT.master.dashboard.referencePhotoAlt}
                            fill
                            sizes="(max-width: 768px) 100vw, 520px"
                            className="object-cover"
                          />
                        </div>
                      </a>
                    ) : null}
                    {booking.bookingAnswers && booking.bookingAnswers.length > 0 ? (
                      <div className="mt-2 space-y-1">
                        {booking.bookingAnswers.map((answer) => (
                          <div key={answer.questionId}>
                            {UI_TEXT.master.dashboard.answerPrefix} {answer.questionText}: {answer.answer}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {booking.status === "PENDING" && booking.actionRequiredBy === "MASTER" ? (
                    <>
                      <button
                        type="button"
                        disabled={actionId === booking.id}
                        onClick={() => void updateStatus(booking, "CONFIRMED")}
                        className="rounded-lg border border-border-subtle bg-bg-input px-3 py-1 text-sm transition hover:bg-bg-card"
                      >
                        {UI_TEXT.master.dashboard.actions.confirm}
                      </button>
                      <button
                        type="button"
                        disabled={actionId === booking.id}
                        onClick={() => void updateStatus(booking, "REJECTED")}
                        className="rounded-lg border border-border-subtle bg-bg-input px-3 py-1 text-sm transition hover:bg-bg-card"
                      >
                        {UI_TEXT.master.dashboard.actions.reject}
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
                        {UI_TEXT.master.dashboard.actions.confirmMove}
                      </button>
                      <button
                        type="button"
                        disabled={actionId === booking.id}
                        onClick={() => void updateStatus(booking, "REJECTED")}
                        className="rounded-lg border border-border-subtle bg-bg-input px-3 py-1 text-sm transition hover:bg-bg-card"
                      >
                        {UI_TEXT.master.dashboard.actions.rejectMove}
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
                      {UI_TEXT.master.dashboard.actions.requestMove}
                    </button>
                  ) : null}
                </div>
                <div className="mt-4 rounded-2xl border border-border-subtle bg-bg-input/40 p-3">
                  <button
                    type="button"
                    onClick={() => toggleChat(booking.id)}
                    className="flex w-full items-center justify-between text-sm font-medium"
                  >
                    <span>{UI_TEXT.master.dashboard.labels.chat}</span>
                    {chatUnreadMap[booking.id] ? (
                      <Badge className="px-2 py-0.5 text-[11px]">{chatUnreadMap[booking.id]}</Badge>
                    ) : null}
                  </button>
                  {chatOpenMap[booking.id] ? (
                    <div className="mt-3">
                      <BookingChat
                        bookingId={booking.id}
                        currentRole="MASTER"
                        onUnreadCountChange={(count) => handleUnreadChange(booking.id, count)}
                      />
                    </div>
                  ) : null}
                </div>
              </section>
            ))}

            {sortedBookings.length === 0 ? (
               <div className="lux-card rounded-[24px] p-5">
                <div className="text-sm font-semibold">{UI_TEXT.master.dashboard.labels.emptyBookingsTitle}</div>
                <div className="mt-1 text-sm text-text-sec">{UI_TEXT.master.dashboard.labels.emptyBookingsDesc}</div>
              </div>
            ) : null}
          </div>

          <div className="space-y-3">
            <MasterAdvisorSection />
            <section className="lux-card rounded-[24px] p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">{UI_TEXT.master.dashboard.labels.balanceTitle}</h3>
                <button
                  type="button"
                  onClick={() => setBalanceVisible((v) => !v)}
                  className="text-sm"
                  aria-label={UI_TEXT.master.dashboard.labels.balanceToggleAria}
                >
                  {balanceVisible ? UI_TEXT.master.dashboard.labels.hideBalance : UI_TEXT.master.dashboard.labels.showBalance}
                </button>
              </div>
              <div className={`text-2xl font-semibold ${balanceVisible ? "" : "blur-sm select-none"}`}>
                {formatMoney(data.monthEarnings)}
              </div>
            </section>

            <section className="lux-card rounded-[24px] p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">
                  {UI_TEXT.master.dashboard.freeSlots.title},{" "}
                  {UI_FMT.dateShort(freeSlotsDate, { timeZone: freeSlotsTimezone })}
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSlotsReloadTick((value) => value + 1)}
                    className="rounded-lg border border-border-subtle bg-bg-input px-2 py-1 text-xs"
                    aria-label={UI_TEXT.master.dashboard.labels.refreshSlotsAria}
                  >
                    {UI_TEXT.master.dashboard.labels.refresh}
                  </button>
                  <button type="button" onClick={() => setStoryOpen(true)} className="rounded-lg border border-border-subtle bg-bg-input px-2 py-1 text-xs">
                    {UI_TEXT.master.dashboard.labels.publishStories}
                  </button>
                </div>
              </div>

              {slotsLoading ? (
                <div className="text-sm text-text-sec">{UI_TEXT.master.dashboard.labels.slotsLoading}</div>
              ) : null}
              {slotsError ? <div className="text-sm text-red-600">{slotsError}</div> : null}
              {!slotsLoading && !slotsError ? (
                displayFreeSlots.length === 0 ? (
                  <div className="text-text-sec">{UI_TEXT.master.dashboard.freeSlots.empty}</div>
                ) : (
                  <div className="max-h-56 space-y-2 overflow-auto text-sm text-text-sec">
                    {displayFreeSlots.map((slot) => (
                      <div key={slot.key} className="flex flex-wrap items-start gap-2 rounded-xl border border-border-subtle bg-bg-input/70 px-2 py-2">
                        <div className="w-12 shrink-0 text-sm font-semibold text-text-main">{slot.time}</div>
                        <div className="flex flex-1 flex-wrap gap-1.5">
                          {slot.slots.map((categorySlot) => (
                            <button
                              key={`${slot.key}:${categorySlot.categoryId}`}
                              type="button"
                              onClick={() => openManualBookingFromFreeSlot(categorySlot)}
                              disabled={!data.isSolo || !categorySlot.serviceId}
                              className="inline-flex items-center gap-1 rounded-full border border-border-subtle px-2.5 py-1 text-xs text-text-main transition hover:bg-bg-card disabled:cursor-not-allowed disabled:opacity-60"
                              title={
                                data.isSolo
                                  ? UI_TEXT.master.dashboard.labels.manualBookingButton
                                  : UI_TEXT.master.dashboard.labels.addBookingDisabled
                              }
                            >
                              <span>{categorySlot.categoryName}</span>
                              <span className="text-text-sec">{formatFreeSlotDuration(categorySlot)}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : null}
            </section>

            <section className="lux-card rounded-[24px] p-4">
              <h3 className="mb-2 text-sm font-semibold">{UI_TEXT.master.dashboard.labels.notificationsTitle}</h3>
              <div className="space-y-2">
                {data.latestReviews.length === 0 ? (
                    <div className="text-sm text-text-sec">{UI_TEXT.master.dashboard.labels.noReviews}</div>
                ) : (
                  data.latestReviews.map((review) => (
                    <button
                      key={review.id}
                      type="button"
                      onClick={() => router.push("/cabinet/master/reviews")}
                      className="w-full rounded-xl border border-border-subtle bg-bg-input/70 p-2 text-left text-sm transition hover:bg-bg-input"
                    >
                      <div className="font-medium">
                        {review.authorName} • ★{review.rating}
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
            <h3 className="text-base font-semibold">{UI_TEXT.master.dashboard.stories.previewTitle}</h3>
            <div className="mt-3 rounded-xl border border-border-subtle bg-bg-input p-3 text-sm">
              <div className="font-medium">
                {UI_TEXT.master.dashboard.labels.slotsOnDate.replace(
                  "{date}",
                  UI_FMT.dateShort(freeSlotsDate, { timeZone: freeSlotsTimezone })
                )}
              </div>
              <div className="mt-2 space-y-1">
                {displayFreeSlots.length === 0 ? <div>{UI_TEXT.master.dashboard.freeSlots.empty}</div> : null}
                {displayFreeSlots.slice(0, STORIES_SLOTS_PER_CARD).map((slot) => (
                  <div key={slot.key}>
                    {slot.time}:{" "}
                    {slot.slots
                      .map((categorySlot) => `${categorySlot.categoryName} (${formatFreeSlotDuration(categorySlot)})`)
                      .join(", ")}
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setStoryOpen(false)}
                className="rounded-lg border border-border-subtle bg-bg-input px-3 py-2 text-sm"
              >
                {UI_TEXT.actions.close}
              </button>
              <button
                type="button"
                onClick={() => void uploadStoriesToMedia()}
                disabled={storyGenerating}
                className="rounded-lg border border-border-subtle bg-bg-input px-3 py-2 text-sm disabled:opacity-60"
              >
                {storyGenerating ? UI_TEXT.status.saving : UI_TEXT.master.dashboard.stories.saveToMedia}
              </button>
              <button
                type="button"
                onClick={downloadStory}
                className="rounded-lg bg-gradient-to-r from-primary via-primary-hover to-primary-magenta px-3 py-2 text-sm text-[rgb(var(--accent-foreground))]"
              >
                {UI_TEXT.master.dashboard.stories.download}
              </button>
              </div>
            {storyError ? <div className="mt-3 text-sm text-red-600">{storyError}</div> : null}
            {storyAssets.length > 0 ? (
              <div className="mt-4 space-y-2">
                <div className="text-sm font-medium">{UI_TEXT.master.dashboard.labels.savedCardsTitle}</div>
                <div className="grid grid-cols-2 gap-2">
                  {storyAssets.map((asset) => (
                    <a
                      key={asset.id}
                      href={asset.url}
                      target="_blank"
                      rel="noreferrer"
                      className="relative block h-40 overflow-hidden rounded-xl border border-border-subtle"
                    >
                      <Image
                        src={asset.url}
                        alt={UI_TEXT.master.dashboard.stories.cardAlt}
                        fill
                        sizes="(max-width: 768px) 50vw, 320px"
                        className="object-cover"
                      />
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
            <h3 className="text-base font-semibold">{UI_TEXT.master.dashboard.manualBooking.title}</h3>
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
                <option value="">{UI_TEXT.master.dashboard.manualBooking.chooseService}</option>
                {data.services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.title} • {service.durationMin} {UI_TEXT.common.minutesShort} • {formatMoney(service.price)}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={manualClientName}
                onChange={(event) => setManualClientName(event.target.value)}
                placeholder={UI_TEXT.master.dashboard.manualBooking.clientNamePlaceholder}
                className="lux-input w-full rounded-lg px-3 py-2 text-sm"
              />
              <input
                type="text"
                value={manualClientPhone}
                onChange={(event) => setManualClientPhone(event.target.value)}
                placeholder={UI_TEXT.master.dashboard.manualBooking.phonePlaceholder}
                className="lux-input w-full rounded-lg px-3 py-2 text-sm"
              />
              <textarea
                value={manualNotes}
                onChange={(event) => setManualNotes(event.target.value)}
                placeholder={UI_TEXT.master.dashboard.manualBooking.commentPlaceholder}
                className="lux-input w-full rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setManualOpen(false)}
                className="rounded-lg border border-border-subtle bg-bg-input px-3 py-2 text-sm"
              >
                {UI_TEXT.actions.cancel}
              </button>
              <button
                type="button"
                onClick={() => void createManualBooking()}
                disabled={savingManual}
                className="rounded-lg bg-gradient-to-r from-primary via-primary-hover to-primary-magenta px-3 py-2 text-sm text-[rgb(var(--accent-foreground))] disabled:opacity-60"
              >
                {savingManual ? UI_TEXT.status.saving : UI_TEXT.master.dashboard.manualBooking.create}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

