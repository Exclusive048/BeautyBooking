"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, RefreshCw, Share2, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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

type SlotsRounding = "exact" | "30min" | "1hour";
type StoryBgVariant = "gradient" | "light" | "dark";

type DayData = {
  masterId: string;
  date: string;
  isSolo: boolean;
  masterName: string;
  masterAvatarUrl: string | null;
  masterPublicUsername: string | null;
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

const MONTHS_RU = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"] as const;
const WEEKDAYS_SHORT_RU = ["вс","пн","вт","ср","чт","пт","сб"] as const;

function formatDateCompact(dateKey: string): string {
  const parts = dateKey.split("-").map(Number);
  const y = parts[0] ?? 2026;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${d} ${MONTHS_RU[dt.getUTCMonth()] ?? ""}, ${WEEKDAYS_SHORT_RU[dt.getUTCDay()] ?? ""}`;
}

function applyRounding(slots: DashboardFreeSlot[], rounding: SlotsRounding): DashboardFreeSlot[] {
  if (rounding === "exact") return slots;
  const step = rounding === "30min" ? 30 : 60;
  const seen = new Set<string>();
  const result: DashboardFreeSlot[] = [];
  for (const slot of slots) {
    const [hStr, mStr] = slot.time.split(":");
    const h = parseInt(hStr ?? "0", 10);
    const min = parseInt(mStr ?? "0", 10);
    const totalMin = h * 60 + min;
    const rounded = Math.floor(totalMin / step) * step;
    const rh = Math.floor(rounded / 60);
    const rm = rounded % 60;
    const key = `${String(rh).padStart(2, "0")}:${String(rm).padStart(2, "0")}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push({ ...slot, time: key });
    }
  }
  return result;
}

function loadCanvasImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function drawRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

async function renderStoryToCanvas(
  canvas: HTMLCanvasElement,
  opts: {
    slots: string[];
    masterName: string;
    masterAvatarUrl: string | null;
    masterPublicUsername: string | null;
    dateStr: string;
    bgVariant: StoryBgVariant;
    serviceLabel: string;
  }
): Promise<void> {
  const W = canvas.width;
  const H = canvas.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const s = W / 1080;

  // Background
  if (opts.bgVariant === "gradient") {
    const g = ctx.createLinearGradient(0, 0, W * 0.6, H);
    g.addColorStop(0, "#6d28d9");
    g.addColorStop(0.5, "#a855f7");
    g.addColorStop(1, "#ec4899");
    ctx.fillStyle = g;
  } else if (opts.bgVariant === "light") {
    ctx.fillStyle = "#f5f3ff";
  } else {
    ctx.fillStyle = "#0d0d14";
  }
  ctx.fillRect(0, 0, W, H);

  const ink = opts.bgVariant === "light" ? "#1a1033" : "#ffffff";
  const sub = opts.bgVariant === "light" ? "rgba(30,10,80,0.45)" : "rgba(255,255,255,0.55)";
  const chipBg = opts.bgVariant === "light" ? "rgba(109,40,217,0.10)" : "rgba(255,255,255,0.15)";
  const chipInk = opts.bgVariant === "light" ? "#6d28d9" : "#ffffff";

  // Brand
  ctx.fillStyle = opts.bgVariant === "light" ? "rgba(109,40,217,0.55)" : "rgba(255,255,255,0.45)";
  ctx.font = `600 ${26 * s}px system-ui,-apple-system,sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("МастерРядом", W / 2, 90 * s);

  // Avatar
  const avR = 90 * s;
  const avX = W / 2;
  const avY = 250 * s;
  ctx.save();
  ctx.beginPath();
  ctx.arc(avX, avY, avR, 0, Math.PI * 2);
  ctx.clip();
  const avImg = opts.masterAvatarUrl ? await loadCanvasImage(opts.masterAvatarUrl) : null;
  if (avImg) {
    ctx.drawImage(avImg, avX - avR, avY - avR, avR * 2, avR * 2);
  } else {
    ctx.fillStyle = opts.bgVariant === "light" ? "#e0d4ff" : "rgba(255,255,255,0.15)";
    ctx.fillRect(avX - avR, avY - avR, avR * 2, avR * 2);
    ctx.fillStyle = chipInk;
    ctx.font = `bold ${60 * s}px system-ui`;
    ctx.textAlign = "center";
    ctx.fillText(opts.masterName.slice(0, 1).toUpperCase(), avX, avY + 20 * s);
  }
  ctx.restore();

  // Name
  ctx.fillStyle = ink;
  ctx.font = `bold ${50 * s}px system-ui,-apple-system,sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(opts.masterName, W / 2, 390 * s);

  if (opts.serviceLabel) {
    ctx.fillStyle = sub;
    ctx.font = `${32 * s}px system-ui,-apple-system,sans-serif`;
    ctx.fillText(opts.serviceLabel, W / 2, 438 * s);
  }

  // Divider
  ctx.fillStyle = opts.bgVariant === "light" ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.15)";
  ctx.fillRect(80 * s, 488 * s, W - 160 * s, 1.5 * s);

  // Title
  ctx.fillStyle = ink;
  ctx.font = `bold ${46 * s}px system-ui,-apple-system,sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("Свободные окошки", W / 2, 566 * s);

  ctx.fillStyle = sub;
  ctx.font = `${32 * s}px system-ui,-apple-system,sans-serif`;
  ctx.fillText(opts.dateStr, W / 2, 614 * s);

  // Slots chips
  const shown = opts.slots.slice(0, STORIES_SLOTS_PER_CARD);
  const extra = opts.slots.length - STORIES_SLOTS_PER_CARD;
  const COLS = 3;
  const cW = 290 * s;
  const cH = 80 * s;
  const cR = 18 * s;
  const gX = (W - COLS * cW) / (COLS + 1);
  const gY = 18 * s;
  const startY = 680 * s;

  for (let i = 0; i < shown.length; i++) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const cx = gX + col * (cW + gX);
    const cy = startY + row * (cH + gY);
    ctx.fillStyle = chipBg;
    drawRoundRect(ctx, cx, cy, cW, cH, cR);
    ctx.fill();
    ctx.fillStyle = chipInk;
    ctx.font = `bold ${30 * s}px system-ui,-apple-system,sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(shown[i] ?? "", cx + cW / 2, cy + cH / 2 + 11 * s);
  }

  if (extra > 0) {
    const rows = Math.ceil(shown.length / COLS);
    ctx.fillStyle = sub;
    ctx.font = `${28 * s}px system-ui,-apple-system,sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(`и ещё ${extra} окошек`, W / 2, startY + rows * (cH + gY) + 20 * s);
  }

  if (opts.slots.length === 0) {
    ctx.fillStyle = sub;
    ctx.font = `${32 * s}px system-ui,-apple-system,sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("Нет свободных слотов", W / 2, startY + 50 * s);
  }

  // Footer
  ctx.fillStyle = opts.bgVariant === "light" ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.15)";
  ctx.fillRect(80 * s, 1710 * s, W - 160 * s, 1.5 * s);
  const profileUrl = opts.masterPublicUsername ? `beautyhub.art/u/${opts.masterPublicUsername}` : "beautyhub.art";
  ctx.fillStyle = sub;
  ctx.font = `${28 * s}px system-ui,-apple-system,sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(profileUrl, W / 2, 1778 * s);
}

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
    masterName: "",
    masterAvatarUrl: null,
    masterPublicUsername: null,
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
  const [storyServiceId, setStoryServiceId] = useState<string>("all");
  const [storyRounding, setStoryRounding] = useState<SlotsRounding>("1hour");
  const [storyBgVariant, setStoryBgVariant] = useState<StoryBgVariant>("gradient");
  const [slotsRounding, setSlotsRounding] = useState<SlotsRounding>("exact");
  const storyPreviewCanvasRef = useRef<HTMLCanvasElement | null>(null);
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

  const buildDisplaySlots = (slots: DashboardFreeSlot[]): DisplayFreeSlotHour[] => {
    const byHour = new Map<string, DisplayFreeSlotHour>();
    for (const slot of slots) {
      const existing = byHour.get(slot.time);
      if (existing) {
        existing.slots.push(slot);
        continue;
      }
      byHour.set(slot.time, { key: slot.time, time: slot.time, startsAt: slot.startsAt, slots: [slot] });
    }
    return Array.from(byHour.values())
      .sort((a, b) => a.time.localeCompare(b.time))
      .map((group) => ({ ...group, slots: group.slots.slice().sort((a, b) => a.categoryName.localeCompare(b.categoryName, "ru")) }));
  };

  const displayFreeSlots = useMemo<DisplayFreeSlotHour[]>(() => {
    return buildDisplaySlots(applyRounding(freeSlots, slotsRounding));
  }, [freeSlots, slotsRounding]);

  const storySlotsForService = useMemo<string[]>(() => {
    let base = freeSlots;
    if (storyServiceId !== "all") {
      const svc = data.services.find((s) => s.id === storyServiceId);
      if (svc) {
        base = base.filter((slot) => slot.maxFitDuration >= svc.durationMin);
      }
    }
    const rounded = applyRounding(base, storyRounding);
    const seen = new Set<string>();
    const times: string[] = [];
    for (const slot of rounded) {
      if (!seen.has(slot.time)) {
        seen.add(slot.time);
        times.push(slot.time);
      }
    }
    return times;
  }, [freeSlots, storyServiceId, storyRounding, data.services]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load is recreated each render, only re-fetch on date change
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

  useEffect(() => {
    if (!storyOpen) return;
    const canvas = storyPreviewCanvasRef.current;
    if (!canvas) return;

    const svc = data.services.find((s) => s.id === storyServiceId);
    const serviceLabel = svc ? `${svc.title}` : "";
    const dateStr = formatDateCompact(new Date(freeSlotsDate).toISOString().slice(0, 10));

    let active = true;
    void renderStoryToCanvas(canvas, {
      slots: storySlotsForService,
      masterName: data.masterName || "Мастер",
      masterAvatarUrl: data.masterAvatarUrl,
      masterPublicUsername: data.masterPublicUsername,
      dateStr,
      bgVariant: storyBgVariant,
      serviceLabel,
    }).catch(() => {
      // canvas render error — preview stays as last rendered
    });

    return () => {
      active = false;
      void active; // prevent unused variable lint warning
    };
  }, [storyOpen, storySlotsForService, storyBgVariant, storyServiceId, data.masterName, data.masterAvatarUrl, data.masterPublicUsername, data.services, freeSlotsDate]);

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
    const previewCanvas = storyPreviewCanvasRef.current;
    if (!previewCanvas) return;
    setStoryGenerating(true);
    setStoryError(null);
    setStoryAssets([]);
    try {
      const fullCanvas = document.createElement("canvas");
      fullCanvas.width = 1080;
      fullCanvas.height = 1920;
      const svc = data.services.find((s) => s.id === storyServiceId);
      await renderStoryToCanvas(fullCanvas, {
        slots: storySlotsForService,
        masterName: data.masterName || "Мастер",
        masterAvatarUrl: data.masterAvatarUrl,
        masterPublicUsername: data.masterPublicUsername,
        dateStr: formatDateCompact(new Date(freeSlotsDate).toISOString().slice(0, 10)),
        bgVariant: storyBgVariant,
        serviceLabel: svc ? svc.title : "",
      });
      const file = await canvasToFile(fullCanvas, `story-${date}.png`);
      const formData = new FormData();
      formData.set("file", file);
      formData.set("entityType", "MASTER");
      formData.set("entityId", data.masterId);
      formData.set("kind", "PORTFOLIO");
      const response = await fetch("/api/media", { method: "POST", body: formData });
      const json = (await response.json().catch(() => null)) as ApiResponse<{ asset: MediaAssetDto }> | null;
      if (!response.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${response.status}`);
      }
      setStoryAssets([json.data.asset]);
    } catch (uploadError) {
      setStoryError(uploadError instanceof Error ? uploadError.message : UI_TEXT.master.dashboard.errors.saveStories);
    } finally {
      setStoryGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="lux-card rounded-[24px] p-3">
        <div className="flex items-center gap-1">
          <Button
            onClick={() => setDate((d) => dateShift(d, -1))}
            variant="ghost"
            size="none"
            aria-label={UI_TEXT.master.dashboard.dateNav.prevDay}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-text-sec hover:bg-bg-input"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Button>

          <div className="flex min-w-0 flex-1 flex-col items-center">
            <span className="text-sm font-semibold text-text-main">
              {formatDateCompact(date)}
            </span>
            {date === todayDateKey() ? (
              <span className="mt-0.5 rounded-full bg-primary/10 px-2 py-px text-[10px] font-medium text-primary">
                {UI_TEXT.master.dashboard.stories.today}
              </span>
            ) : null}
          </div>

          <Button
            onClick={() => setDate((d) => dateShift(d, 1))}
            variant="ghost"
            size="none"
            aria-label={UI_TEXT.master.dashboard.dateNav.nextDay}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-text-sec hover:bg-bg-input"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>

          <Button
            onClick={() => void load()}
            variant="ghost"
            size="none"
            aria-label={UI_TEXT.master.dashboard.dateNav.refresh}
            title={UI_TEXT.master.dashboard.dateNav.refresh}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-text-sec hover:bg-bg-input"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">{UI_TEXT.status.loading}</div>
      ) : null}
      {error ? <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-300">{error}</div> : null}

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
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setManualOpen(true)}
                disabled={!data.isSolo}
                title={
                  data.isSolo
                    ? UI_TEXT.master.dashboard.labels.addBooking
                    : UI_TEXT.master.dashboard.labels.addBookingDisabled
                }
              >
                {UI_TEXT.master.dashboard.labels.manualBookingButton}
              </Button>
            </div>

            <div className="lux-card rounded-[24px] p-4 text-sm">
              {data.workingHours.isDayOff ? (
                <div className="flex items-center justify-between gap-2">
                  <span>{UI_TEXT.master.dashboard.labels.todayOff}</span>
                  <Link href="/cabinet/master/schedule" className="text-xs text-primary underline">
                    {UI_TEXT.master.dashboard.labels.change}
                  </Link>
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
                  <Link href="/cabinet/master/schedule" className="text-xs text-primary underline">
                    {UI_TEXT.master.dashboard.labels.change}
                  </Link>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <span>{UI_TEXT.master.dashboard.labels.workingHoursNotSet}</span>
                  <Link href="/cabinet/master/schedule" className="text-xs text-primary underline">
                    {UI_TEXT.master.dashboard.labels.setup}
                  </Link>
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
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={actionId === booking.id}
                        onClick={() => void updateStatus(booking, "CONFIRMED")}
                      >
                        {UI_TEXT.master.dashboard.actions.confirm}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={actionId === booking.id}
                        onClick={() => void updateStatus(booking, "REJECTED")}
                      >
                        {UI_TEXT.master.dashboard.actions.reject}
                      </Button>
                    </>
                  ) : null}
                  {booking.status === "CHANGE_REQUESTED" &&
                  booking.actionRequiredBy === "MASTER" ? (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={actionId === booking.id}
                        onClick={() => void updateStatus(booking, "CONFIRMED")}
                      >
                        {UI_TEXT.master.dashboard.actions.confirmMove}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={actionId === booking.id}
                        onClick={() => void updateStatus(booking, "REJECTED")}
                      >
                        {UI_TEXT.master.dashboard.actions.rejectMove}
                      </Button>
                    </>
                  ) : null}
                  {canMasterRequestMove(booking) ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={actionId === booking.id}
                      onClick={() => void requestReschedule(booking)}
                    >
                      {UI_TEXT.master.dashboard.actions.requestMove}
                    </Button>
                  ) : null}
                </div>
                <div className="mt-4 rounded-2xl border border-border-subtle bg-bg-input/40 p-3">
                  <Button
                    variant="wrapper"
                    onClick={() => toggleChat(booking.id)}
                    className="flex w-full items-center justify-between text-sm font-medium"
                  >
                    <span>{UI_TEXT.master.dashboard.labels.chat}</span>
                    {chatUnreadMap[booking.id] ? (
                      <Badge className="px-2 py-0.5 text-[11px]">{chatUnreadMap[booking.id]}</Badge>
                    ) : null}
                  </Button>
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
                <Button
                  variant="ghost"
                  size="none"
                  onClick={() => setBalanceVisible((v) => !v)}
                  className="text-sm"
                  aria-label={UI_TEXT.master.dashboard.labels.balanceToggleAria}
                >
                  {balanceVisible ? UI_TEXT.master.dashboard.labels.hideBalance : UI_TEXT.master.dashboard.labels.showBalance}
                </Button>
              </div>
              <div className={`text-2xl font-semibold ${balanceVisible ? "" : "blur-sm select-none"}`}>
                {formatMoney(data.monthEarnings)}
              </div>
            </section>

            <section className="lux-card rounded-[24px] p-4">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold">
                    {UI_TEXT.master.dashboard.freeSlots.title}
                  </h3>
                  <div className="mt-0.5 text-xs text-text-sec">
                    {UI_FMT.dateShort(freeSlotsDate, { timeZone: freeSlotsTimezone })}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="none"
                    onClick={() => setSlotsReloadTick((value) => value + 1)}
                    aria-label={UI_TEXT.master.dashboard.labels.refreshSlotsAria}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-text-sec hover:bg-bg-input"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                  <Button
                    variant="secondary"
                    size="none"
                    onClick={() => setStoryOpen(true)}
                    className="rounded-lg px-2.5 py-1 text-xs"
                  >
                    {UI_TEXT.master.dashboard.labels.publishStories}
                  </Button>
                </div>
              </div>

              <div className="mb-3 flex flex-wrap gap-1.5">
                {(["exact", "30min", "1hour"] as SlotsRounding[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setSlotsRounding(r)}
                    className={[
                      "rounded-full border px-3 py-1 text-xs transition",
                      slotsRounding === r
                        ? "border-primary bg-primary/10 font-medium text-primary"
                        : "border-border-subtle bg-bg-input text-text-sec hover:bg-bg-card",
                    ].join(" ")}
                  >
                    {r === "exact" && UI_TEXT.master.dashboard.freeSlots.roundingExact}
                    {r === "30min" && UI_TEXT.master.dashboard.freeSlots.rounding30min}
                    {r === "1hour" && UI_TEXT.master.dashboard.freeSlots.rounding1hour}
                  </button>
                ))}
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
                            <Button
                              key={`${slot.key}:${categorySlot.categoryId}`}
                              variant="ghost"
                              size="none"
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
                            </Button>
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
                    <Button
                      key={review.id}
                      variant="wrapper"
                      onClick={() => router.push("/cabinet/master/reviews")}
                      className="w-full rounded-xl border border-border-subtle bg-bg-input/70 p-2 text-left text-sm transition hover:bg-bg-input"
                    >
                      <div className="font-medium">
                        {review.authorName} • ★{review.rating}
                      </div>
                      {review.text ? <div className="text-text-sec">{review.text}</div> : null}
                    </Button>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {storyOpen ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 sm:items-center sm:p-4">
          <div className="w-full max-w-lg overflow-hidden rounded-t-[28px] border border-border-subtle bg-bg-card shadow-hover sm:rounded-[28px]">
            {/* Header */}
            <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-5 py-4">
              <h3 className="text-base font-semibold text-text-main">{UI_TEXT.master.dashboard.stories.previewTitle}</h3>
              <Button variant="ghost" size="none" onClick={() => setStoryOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-text-sec hover:bg-bg-input"
                aria-label={UI_TEXT.actions.close}>
                ✕
              </Button>
            </div>

            <div className="max-h-[80dvh] overflow-y-auto p-5">
              {/* Settings row */}
              <div className="space-y-3">
                {/* Service selector */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-sec">Услуга</label>
                  <Select value={storyServiceId} onChange={(e) => setStoryServiceId(e.target.value)}>
                    <option value="all">{UI_TEXT.master.dashboard.stories.allServices}</option>
                    {data.services.map((svc) => (
                      <option key={svc.id} value={svc.id}>
                        {svc.title} • {svc.durationMin} {UI_TEXT.common.minutesShort}
                      </option>
                    ))}
                  </Select>
                </div>

                {/* Rounding chips */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-sec">Округление</label>
                  <div className="flex gap-1.5">
                    {(["exact", "30min", "1hour"] as SlotsRounding[]).map((r) => (
                      <button key={r} type="button" onClick={() => setStoryRounding(r)}
                        className={["rounded-full border px-3 py-1 text-xs transition",
                          storyRounding === r ? "border-primary bg-primary/10 font-medium text-primary" : "border-border-subtle bg-bg-input text-text-sec hover:bg-bg-card"].join(" ")}>
                        {r === "exact" && UI_TEXT.master.dashboard.freeSlots.roundingExact}
                        {r === "30min" && UI_TEXT.master.dashboard.freeSlots.rounding30min}
                        {r === "1hour" && UI_TEXT.master.dashboard.freeSlots.rounding1hour}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Background variant */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-sec">Фон</label>
                  <div className="flex gap-1.5">
                    {([
                      { v: "gradient" as StoryBgVariant, label: UI_TEXT.master.dashboard.stories.bgGradient, cls: "bg-gradient-to-r from-violet-600 to-pink-500 text-white border-transparent" },
                      { v: "light" as StoryBgVariant, label: UI_TEXT.master.dashboard.stories.bgLight, cls: "bg-white text-gray-900 border-gray-200" },
                      { v: "dark" as StoryBgVariant, label: UI_TEXT.master.dashboard.stories.bgDark, cls: "bg-gray-950 text-white border-gray-700" },
                    ]).map(({ v, label, cls }) => (
                      <button key={v} type="button" onClick={() => setStoryBgVariant(v)}
                        className={["rounded-full border px-3 py-1 text-xs transition", cls,
                          storyBgVariant === v ? "ring-2 ring-primary ring-offset-1" : "opacity-70 hover:opacity-100"].join(" ")}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Canvas preview */}
              <div className="mt-4 flex justify-center">
                <div className="relative overflow-hidden rounded-2xl border border-border-subtle bg-bg-input" style={{ width: 270, height: 480 }}>
                  <canvas
                    ref={storyPreviewCanvasRef}
                    width={1080}
                    height={1920}
                    className="h-full w-full"
                    aria-label={UI_TEXT.master.dashboard.stories.cardAlt}
                  />
                  {storyGenerating ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-sm text-white">
                      {UI_TEXT.master.dashboard.stories.generating}
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Slot count hint */}
              <div className="mt-2 text-center text-xs text-text-sec">
                {storySlotsForService.length === 0
                  ? UI_TEXT.master.dashboard.stories.noSlots
                  : `${storySlotsForService.length} окошек`}
              </div>

              {storyError ? (
                <div role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-400/30 dark:bg-red-950/30 dark:text-red-300">
                  {storyError}
                </div>
              ) : null}

              {/* Actions */}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    const canvas = storyPreviewCanvasRef.current;
                    if (!canvas) return;
                    const link = document.createElement("a");
                    link.download = `okoshki-${new Date(freeSlotsDate).toISOString().slice(0, 10)}.png`;
                    link.href = canvas.toDataURL("image/png");
                    link.click();
                  }}
                  disabled={storyGenerating}
                  className="flex items-center gap-1.5"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden />
                  {UI_TEXT.master.dashboard.stories.download}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    const canvas = storyPreviewCanvasRef.current;
                    if (!canvas) return;
                    canvas.toBlob(async (blob) => {
                      if (!blob) return;
                      const file = new File([blob], `okoshki-${new Date(freeSlotsDate).toISOString().slice(0, 10)}.png`, { type: "image/png" });
                      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
                      if (nav.canShare?.({ files: [file] })) {
                        await navigator.share({ files: [file], title: "Свободные окошки" });
                      } else {
                        const link = document.createElement("a");
                        link.download = file.name;
                        link.href = canvas.toDataURL("image/png");
                        link.click();
                      }
                    }, "image/png");
                  }}
                  disabled={storyGenerating}
                  className="flex items-center gap-1.5"
                >
                  <Share2 className="h-3.5 w-3.5" aria-hidden />
                  {UI_TEXT.master.dashboard.stories.share}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void uploadStoriesToMedia()}
                  disabled={storyGenerating}
                >
                  {storyGenerating ? UI_TEXT.status.saving : UI_TEXT.master.dashboard.stories.saveToMedia}
                </Button>
              </div>

              {storyAssets.length > 0 ? (
                <div className="mt-4 space-y-2">
                  <div className="text-sm font-medium">{UI_TEXT.master.dashboard.labels.savedCardsTitle}</div>
                  <div className="grid grid-cols-2 gap-2">
                    {storyAssets.map((asset) => (
                      <a key={asset.id} href={asset.url} target="_blank" rel="noreferrer"
                        className="relative block h-40 overflow-hidden rounded-xl border border-border-subtle">
                        <Image src={asset.url} alt={UI_TEXT.master.dashboard.stories.cardAlt}
                          fill sizes="(max-width: 768px) 50vw, 320px" className="object-cover" />
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {manualOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-[24px] border border-border-subtle bg-bg-card p-4 shadow-hover">
            <h3 className="text-base font-semibold">{UI_TEXT.master.dashboard.manualBooking.title}</h3>
            <div className="mt-3 space-y-2">
              <Input
                type="datetime-local"
                value={manualStartAt}
                onChange={(event) => setManualStartAt(event.target.value)}
                className="rounded-lg px-3 py-2 text-sm"
              />
              <Select
                value={manualServiceId}
                onChange={(event) => setManualServiceId(event.target.value)}
              >
                <option value="">{UI_TEXT.master.dashboard.manualBooking.chooseService}</option>
                {data.services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.title} • {service.durationMin} {UI_TEXT.common.minutesShort} • {formatMoney(service.price)}
                  </option>
                ))}
              </Select>
              <Input
                type="text"
                value={manualClientName}
                onChange={(event) => setManualClientName(event.target.value)}
                placeholder={UI_TEXT.master.dashboard.manualBooking.clientNamePlaceholder}
                className="rounded-lg px-3 py-2 text-sm"
              />
              <Input
                type="text"
                value={manualClientPhone}
                onChange={(event) => setManualClientPhone(event.target.value)}
                placeholder={UI_TEXT.master.dashboard.manualBooking.phonePlaceholder}
                className="rounded-lg px-3 py-2 text-sm"
              />
              <Textarea
                value={manualNotes}
                onChange={(event) => setManualNotes(event.target.value)}
                placeholder={UI_TEXT.master.dashboard.manualBooking.commentPlaceholder}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                onClick={() => setManualOpen(false)}
                variant="secondary"
                size="sm"
              >
                {UI_TEXT.actions.cancel}
              </Button>
              <Button
                onClick={() => void createManualBooking()}
                disabled={savingManual}
                size="sm"
              >
                {savingManual ? UI_TEXT.status.saving : UI_TEXT.master.dashboard.manualBooking.create}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

