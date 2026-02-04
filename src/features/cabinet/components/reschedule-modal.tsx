"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { ModalSurface } from "@/components/ui/modal-surface";
import type { ApiResponse } from "@/lib/types/api";
import { SlotPicker } from "@/features/booking/components/slot-picker";
import { timeToMinutes } from "@/lib/schedule/time";
import { UI_TEXT } from "@/lib/ui/text";

type SlotItem = {
  startAtUtc: string;
  endAtUtc: string;
  label: string;
};

type SlotGroup = {
  id: string;
  label: string;
  items: string[];
};

type BookingInfo = {
  id: string;
  providerId: string;
  masterProviderId: string | null;
  serviceId: string;
  slotLabel: string;
};

type Props = {
  booking: BookingInfo;
  onClose: () => void;
  onSuccess: (next: { slotLabel: string }) => void;
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
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return dt.toLocaleDateString("ru-RU", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
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

function groupSlotsByDayPeriod(slots: SlotItem[], dateKey: string): SlotGroup[] {
  const items = slots
    .filter((slot) => slot.label.startsWith(`${dateKey} `))
    .map((slot) => {
      const [, time] = slot.label.split(" ");
      if (!time) return null;
      const minutes = timeToMinutes(time);
      if (minutes === null) return null;
      return { label: slot.label, minutes };
    })
    .filter((v): v is { label: string; minutes: number } => Boolean(v));

  items.sort((a, b) => a.minutes - b.minutes);

  const groups = [
    { id: "morning", label: UI_TEXT.clientCabinet.booking.morning, items: [] as string[] },
    { id: "day", label: UI_TEXT.clientCabinet.booking.day, items: [] as string[] },
    { id: "evening", label: UI_TEXT.clientCabinet.booking.evening, items: [] as string[] },
  ];

  for (const item of items) {
    const group = item.minutes < 13 * 60 ? groups[0] : item.minutes < 18 * 60 ? groups[1] : groups[2];
    group.items.push(item.label);
  }

  return groups.filter((g) => g.items.length > 0).map((g) => ({
    id: `${dateKey}-${g.id}`,
    label: g.label,
    items: g.items,
  }));
}

export function RescheduleModal({ booking, onClose, onSuccess }: Props) {
  const t = UI_TEXT.clientCabinet;
  const [selectedDate, setSelectedDate] = useState<string>(() => buildDateRange(7)[0] ?? "");
  const [slots, setSlots] = useState<SlotItem[]>([]);
  const [slotLabel, setSlotLabel] = useState<string>(booking.slotLabel);
  const [loading, setLoading] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dateOptions = useMemo(() => buildDateRange(7), []);
  const masterId = booking.masterProviderId ?? booking.providerId;

  useEffect(() => {
    let cancelled = false;

    async function loadSlots() {
      if (!masterId || !booking.serviceId || !selectedDate) return;
      setLoadingSlots(true);
      setError(null);
      try {
        const date = new Date(selectedDate);
        const from = new Date(date);
        const to = new Date(date);
        to.setDate(to.getDate() + 1);
        const url = new URL(`/api/masters/${masterId}/availability`, window.location.origin);
        url.searchParams.set("serviceId", booking.serviceId);
        url.searchParams.set("from", from.toISOString());
        url.searchParams.set("to", to.toISOString());

        const res = await fetch(url.toString(), { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as ApiResponse<{ slots: SlotItem[] }> | null;
        if (!res.ok) throw new Error(getErrorMessage(json, t.booking.loadSlotsFailed));
        if (!json || !json.ok) throw new Error(getErrorMessage(json, t.booking.loadSlotsFailed));

        if (!cancelled) {
          setSlots(json.data.slots ?? []);
          const next = json.data.slots?.[0]?.label ?? "";
          if (next) setSlotLabel(next);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : t.bookingsPanel.unknownError);
          setSlots([]);
        }
      } finally {
        if (!cancelled) setLoadingSlots(false);
      }
    }

    void loadSlots();
    return () => {
      cancelled = true;
    };
  }, [
    booking.serviceId,
    masterId,
    selectedDate,
    t.booking.loadSlotsFailed,
    t.bookingsPanel.unknownError,
  ]);

  const slotGroups = useMemo(() => groupSlotsByDayPeriod(slots, selectedDate), [slots, selectedDate]);
  const slotByLabel = useMemo(() => new Map(slots.map((s) => [s.label, s])), [slots]);

  const submit = async () => {
    setError(null);
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
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ booking: { slotLabel: string } }>
        | null;
      if (!res.ok) throw new Error(getErrorMessage(json, t.booking.submitFailed));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, t.booking.submitFailed));

      onSuccess({ slotLabel: json.data.booking.slotLabel });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.bookingsPanel.unknownError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalSurface open onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">{t.booking.moveBooking}</div>
            <div className="text-sm text-text-sec">{t.booking.moveBookingHint}</div>
          </div>
          <Button onClick={onClose} variant="icon" size="icon" aria-label={UI_TEXT.common.close}>
            ×
          </Button>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div>
          <div className="text-sm font-medium">{t.booking.chooseDate}</div>
          <div className="mt-2 flex gap-2 overflow-x-auto">
            {dateOptions.map((date) => {
              const active = date === selectedDate;
              return (
                <Chip
                  key={date}
                  type="button"
                  onClick={() => setSelectedDate(date)}
                  variant={active ? "active" : "default"}
                  className="whitespace-nowrap"
                >
                  {formatDateLabel(date)}
                </Chip>
              );
            })}
          </div>
        </div>

        <div>
          <div className="text-sm font-medium">{t.booking.chooseTime}</div>
          {loadingSlots ? (
            <div className="mt-2 text-sm text-text-sec">{UI_TEXT.common.loading}</div>
          ) : slotGroups.length === 0 ? (
            <div className="mt-2 text-sm text-text-sec">{t.booking.noSlots}</div>
          ) : (
            <div className="mt-3">
              <SlotPicker groups={slotGroups} value={slotLabel} onChange={setSlotLabel} />
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            onClick={onClose}
            variant="secondary"
            className="flex-1"
          >
            {UI_TEXT.common.cancel}
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={loading || loadingSlots}
            className="flex-1"
          >
            {loading ? t.booking.moving : t.booking.moveConfirm}
          </Button>
        </div>
      </div>
    </ModalSurface>
  );
}
