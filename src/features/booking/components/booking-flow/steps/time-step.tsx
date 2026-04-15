"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";
import { UI_FMT } from "@/lib/ui/fmt";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";
import {
  SlotPickerOptimized,
  groupSlotsByTimeOfDay,
} from "@/features/booking/components/slot-picker/slot-picker";
import type { BookingFlowSlot } from "@/features/booking/components/booking-flow/types";

const t = UI_TEXT.publicProfile.bookingFlow;

type RawSlot = {
  startAtUtc: string;
  endAtUtc: string;
  label: string;
  hotSlotId?: string | null;
  isHot?: boolean;
  discountType?: "PERCENT" | "FIXED";
  discountValue?: number;
  originalPrice?: number | null;
  discountedPrice?: number | null;
  discountPercent?: number | null;
};

type Props = {
  providerId: string;
  serviceId: string;
  providerTimezone: string;
  selectedDateKey: string;
  selectedSlot: BookingFlowSlot | null;
  onSelectSlot: (slot: BookingFlowSlot) => void;
};

export function TimeStep({
  providerId,
  serviceId,
  providerTimezone,
  selectedDateKey,
  selectedSlot,
  onSelectSlot,
}: Props) {
  const viewerTimezone = useViewerTimeZoneContext();
  const [slots, setSlots] = useState<BookingFlowSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastDateRef = useRef<string>("");

  const loadSlots = useCallback(
    async (dateKey: string) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      setError(null);
      setSlots([]);

      try {
        const url = new URL(`/api/public/providers/${providerId}/slots`, window.location.origin);
        url.searchParams.set("serviceId", serviceId);
        url.searchParams.set("from", dateKey);
        url.searchParams.set("limit", "1");

        const res = await fetch(url.toString(), { cache: "no-store", signal: ctrl.signal });
        const json = (await res.json().catch(() => null)) as
          | { ok: true; data: { slots: RawSlot[] } }
          | { ok: false; error: { message: string } }
          | null;

        if (ctrl.signal.aborted) return;

        if (!res.ok || !json || !json.ok) {
          setError(t.slotsLoadFailed);
          return;
        }

        const provTZ = providerTimezone.trim() || "UTC";
        const normalized: BookingFlowSlot[] = (json.data.slots ?? [])
          .filter((s) => toLocalDateKey(s.startAtUtc, provTZ) === dateKey)
          .map((s) => ({
            id: `${s.startAtUtc}-${s.label}`,
            label: s.label,
            timeText: UI_FMT.timeShort(s.startAtUtc, { timeZone: viewerTimezone }),
            startAtUtc: s.startAtUtc,
            endAtUtc: s.endAtUtc,
            dayKey: dateKey,
            isHot: s.isHot ?? false,
            hotSlotId: s.hotSlotId ?? null,
            discountType: s.discountType,
            discountValue: s.discountValue,
            originalPrice: s.originalPrice ?? null,
            discountedPrice: s.discountedPrice ?? null,
            discountPercent: s.discountPercent ?? null,
          }));

        setSlots(normalized);
      } catch (err) {
        if (ctrl.signal.aborted) return;
        setError(
          err instanceof Error && err.name !== "AbortError" ? t.slotsLoadFailed : null
        );
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    },
    [providerId, providerTimezone, serviceId, viewerTimezone]
  );

  useEffect(() => {
    if (!selectedDateKey || selectedDateKey === lastDateRef.current) return;
    lastDateRef.current = selectedDateKey;
    void loadSlots(selectedDateKey);
  }, [selectedDateKey, loadSlots]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const slotGroups = groupSlotsByTimeOfDay(slots).filter((g) => g.items.length > 0);
  const selectedLabel = selectedSlot?.dayKey === selectedDateKey ? (selectedSlot?.label ?? undefined) : undefined;

  const handleSelect = useCallback(
    (label: string) => {
      const found = slots.find((s) => s.label === label);
      if (found) onSelectSlot(found);
    },
    [slots, onSelectSlot]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <span className="text-sm text-text-sec">{t.slotsLoading}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3 py-4">
        <p className="text-center text-sm text-text-sec">{error}</p>
        <Button
          variant="secondary"
          size="sm"
          className="mx-auto block rounded-xl"
          onClick={() => void loadSlots(selectedDateKey)}
        >
          {UI_TEXT.publicProfile.slots.refresh}
        </Button>
      </div>
    );
  }

  if (!loading && slotGroups.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-text-sec">{t.noSlotsForDay}</p>
    );
  }

  return (
    <SlotPickerOptimized
      groups={slotGroups}
      value={selectedLabel}
      onChange={handleSelect}
    />
  );
}
