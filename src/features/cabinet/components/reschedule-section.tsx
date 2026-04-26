"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Switch } from "@/components/ui/switch";
import type { ApiResponse } from "@/lib/types/api";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";
import {
  SlotPickerOptimized,
  groupSlotsByTimeOfDay,
  type SlotItem as SlotPickerItem,
} from "@/features/booking/components/slot-picker/slot-picker";
import { BOOKING_ACTION_WINDOW_MINUTES } from "@/lib/bookings/flow";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";
import { toLocalDateKey } from "@/lib/schedule/timezone";

type ApiSlot = {
  startAtUtc: string;
  endAtUtc: string;
  label: string;
};

type BookingInfo = {
  id: string;
  providerId: string;
  masterProviderId: string | null;
  serviceId: string;
  slotLabel: string;
  status:
    | "PENDING"
    | "CONFIRMED"
    | "CHANGE_REQUESTED"
    | "REJECTED"
    | "IN_PROGRESS"
    | "FINISHED"
    | "NEW"
    | "PREPAID"
    | "STARTED"
    | "CANCELLED"
    | "NO_SHOW";
  silentMode: boolean;
  startAtUtc: string | null;
  actionRequiredBy: "CLIENT" | "MASTER" | null;
  clientChangeRequestsCount: number;
  masterChangeRequestsCount: number;
};

type Props = {
  booking: BookingInfo;
  onSuccess: () => void | Promise<void>;
  onCancel: () => void;
};

function getErrorMessage<T>(json: ApiResponse<T> | null, fallback: string) {
  return json && !json.ok ? json.error.message ?? fallback : fallback;
}

function toDateKey(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLabel(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(y!, (m ?? 1) - 1, d ?? 1);
  return dt.toLocaleDateString("ru-RU", { weekday: "short", day: "2-digit", month: "short" });
}

function buildDateRange(days: number) {
  const start = new Date();
  const items: string[] = [];
  for (let i = 0; i < days; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    items.push(toDateKey(d));
  }
  return items;
}

export function RescheduleSection({ booking, onSuccess, onCancel }: Props) {
  const t = UI_TEXT.clientCabinet;
  const viewerTimeZone = useViewerTimeZoneContext();
  const dateOptions = useMemo(() => buildDateRange(60), []);
  const [selectedDate, setSelectedDate] = useState<string>(() => dateOptions[0] ?? "");
  const [slots, setSlots] = useState<ApiSlot[]>([]);
  const [slotLabel, setSlotLabel] = useState<string>(booking.slotLabel);
  const [silentMode, setSilentMode] = useState<boolean>(booking.silentMode);
  const [loading, setLoading] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const masterId = booking.masterProviderId ?? booking.providerId;
  const canEditSilentMode = booking.status === "PENDING";

  useEffect(() => {
    setSilentMode(booking.silentMode);
  }, [booking.silentMode, booking.id]);

  useEffect(() => {
    let cancelled = false;
    const loadSlots = async () => {
      if (!masterId || !booking.serviceId || !selectedDate) return;
      setLoadingSlots(true);
      setError(null);
      try {
        const url = new URL(`/api/masters/${masterId}/availability`, window.location.origin);
        url.searchParams.set("serviceId", booking.serviceId);
        url.searchParams.set("from", selectedDate);
        url.searchParams.set("limit", "1");
        const res = await fetch(url.toString(), { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as
          | ApiResponse<{ slots: ApiSlot[]; meta: { toDateExclusive: string } }>
          | null;
        if (!res.ok) throw new Error(getErrorMessage(json, t.booking.loadSlotsFailed));
        if (!json || !json.ok) throw new Error(getErrorMessage(json, t.booking.loadSlotsFailed));
        if (!cancelled) {
          setSlots(json.data.slots ?? []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : t.bookingsPanel.unknownError);
          setSlots([]);
        }
      } finally {
        if (!cancelled) setLoadingSlots(false);
      }
    };
    void loadSlots();
    return () => { cancelled = true; };
  }, [booking.serviceId, masterId, selectedDate, t.booking.loadSlotsFailed, t.bookingsPanel.unknownError]);

  const slotItemsForDate = useMemo<SlotPickerItem[]>(
    () =>
      slots
        .filter((slot) => toLocalDateKey(slot.startAtUtc, viewerTimeZone) === selectedDate)
        .map((slot) => ({
          id: slot.label,
          label: slot.label,
          timeText: UI_FMT.timeShort(slot.startAtUtc, { timeZone: viewerTimeZone }),
        })),
    [selectedDate, slots, viewerTimeZone]
  );
  const slotGroups = useMemo(
    () => groupSlotsByTimeOfDay(slotItemsForDate).filter((g) => g.items.length > 0),
    [slotItemsForDate]
  );
  const slotByLabel = useMemo(() => new Map(slots.map((s) => [s.label, s])), [slots]);

  const canRescheduleNow = useMemo(() => {
    if (booking.status !== "PENDING" && booking.status !== "CONFIRMED") return false;
    if (!booking.startAtUtc) return true;
    const minutesLeft = (new Date(booking.startAtUtc).getTime() - Date.now()) / 60000;
    return Number.isFinite(minutesLeft) && minutesLeft >= BOOKING_ACTION_WINDOW_MINUTES;
  }, [booking.startAtUtc, booking.status]);

  const submit = async () => {
    setError(null);
    if (!canRescheduleNow) {
      setError("Отмена и перенос недоступны менее чем за 60 минут до начала");
      return;
    }
    if (!slotLabel) {
      setError(t.booking.chooseTime);
      return;
    }
    const slot = slotByLabel.get(slotLabel);
    if (!slot) {
      setError(t.booking.chooseCorrectSlot);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/bookings/${booking.id}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startAtUtc: slot.startAtUtc,
          endAtUtc: slot.endAtUtc,
          slotLabel: slot.label,
          ...(canEditSilentMode ? { silentMode } : {}),
        }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!res.ok) throw new Error(getErrorMessage(json, t.booking.submitFailed));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, t.booking.submitFailed));
      await onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.bookingsPanel.unknownError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-border-subtle bg-bg-input/40 p-4">
      <div className="text-sm font-semibold text-text-main">{t.booking.moveBooking}</div>

      {error ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {/* Date chips — 60-day scrollable */}
      <div>
        <div className="mb-2 text-xs font-medium text-text-sec">{t.booking.chooseDate}</div>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {dateOptions.map((date) => (
            <Chip
              key={date}
              type="button"
              onClick={() => setSelectedDate(date)}
              variant={date === selectedDate ? "active" : "default"}
              className="whitespace-nowrap text-xs"
            >
              {formatDateLabel(date)}
            </Chip>
          ))}
        </div>
      </div>

      {/* Slot picker */}
      <div>
        <div className="mb-2 text-xs font-medium text-text-sec">{t.booking.chooseTime}</div>
        {loadingSlots ? (
          <div className="text-sm text-text-sec">{UI_TEXT.common.loading}</div>
        ) : slotGroups.length === 0 ? (
          <div className="text-sm text-text-sec">{t.booking.noSlots}</div>
        ) : (
          <SlotPickerOptimized groups={slotGroups} value={slotLabel} onChange={setSlotLabel} />
        )}
      </div>

      {/* Silent mode */}
      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border-subtle bg-bg-card p-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-main">Хочу помолчать 🤫</p>
          <p className="mt-0.5 text-xs text-text-sec">
            Мастер поздоровается и дальше будет работать без разговоров.
          </p>
        </div>
        <Switch
          checked={silentMode}
          onCheckedChange={setSilentMode}
          disabled={!canEditSilentMode}
          className="shrink-0"
        />
      </label>

      {/* Actions */}
      <div className="flex gap-2">
        <Button type="button" onClick={onCancel} variant="secondary" size="sm" className="flex-1" disabled={loading}>
          {UI_TEXT.common.cancel}
        </Button>
        <Button
          type="button"
          onClick={submit}
          size="sm"
          className="flex-1"
          disabled={loading || loadingSlots || !canRescheduleNow}
        >
          {loading ? t.booking.moving : t.booking.moveConfirm}
        </Button>
      </div>
    </div>
  );
}
