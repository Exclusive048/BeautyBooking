"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import type { BookingFlowSlot } from "@/features/booking/components/booking-flow/types";

const T = UI_TEXT.publicProfile.bookingWidget;

type Props = {
  providerId: string;
  serviceId: string;
  dateKey: string;
  providerTimezone: string;
  selectedSlot: BookingFlowSlot | null;
  onSelect: (slot: BookingFlowSlot) => void;
};

type SlotPayload = {
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

/**
 * 3-column time grid for a single chosen day (32b).
 *
 * Reuses `/api/public/providers/[id]/slots` with a one-day range —
 * cheap, fully cached on the server side (32a slot endpoint already
 * memoises DayPlan + slot windows). Hot slots get the orange flame
 * badge inline; users still see all slots so a long-tail hot offer
 * doesn't visually crowd out regular ones.
 */
export function TimeGrid({
  providerId,
  serviceId,
  dateKey,
  providerTimezone,
  selectedSlot,
  onSelect,
}: Props) {
  const [slots, setSlots] = useState<BookingFlowSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSlots = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextDay = new Date(`${dateKey}T00:00:00Z`);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      const toKey = [
        nextDay.getUTCFullYear(),
        String(nextDay.getUTCMonth() + 1).padStart(2, "0"),
        String(nextDay.getUTCDate()).padStart(2, "0"),
      ].join("-");

      const url = new URL(
        `/api/public/providers/${providerId}/slots`,
        window.location.origin,
      );
      url.searchParams.set("serviceId", serviceId);
      url.searchParams.set("from", dateKey);
      url.searchParams.set("to", toKey);
      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as
        | { ok: true; data: { slots: SlotPayload[] } }
        | { ok: false; error: { message: string } }
        | null;
      if (!res.ok || !json || !json.ok) {
        setError(UI_TEXT.publicProfile.slots.loadFailed);
        return;
      }
      const parsed: BookingFlowSlot[] = json.data.slots.map((slot) => ({
        id: `${slot.startAtUtc}-${slot.label}`,
        label: slot.label,
        timeText: slot.label.slice(-5),
        dayKey: toLocalDateKey(slot.startAtUtc, providerTimezone),
        startAtUtc: slot.startAtUtc,
        endAtUtc: slot.endAtUtc,
        hotSlotId: slot.hotSlotId ?? null,
        isHot: slot.isHot ?? false,
        discountType: slot.discountType,
        discountValue: slot.discountValue,
        originalPrice: slot.originalPrice ?? null,
        discountedPrice: slot.discountedPrice ?? null,
        discountPercent: slot.discountPercent ?? null,
      }));
      setSlots(parsed);
    } catch {
      setError(UI_TEXT.publicProfile.slots.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [dateKey, providerId, providerTimezone, serviceId]);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);

  return (
    <div>
      <div className="mb-2.5 text-[11px] font-medium uppercase tracking-wider text-text-sec">
        {T.timeLabel}
      </div>
      {loading ? (
        <div className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="h-10 animate-pulse rounded-lg bg-bg-input" />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-text-sec">{error}</p>
      ) : slots.length === 0 ? (
        <p className="text-sm italic text-text-sec">{T.emptyDay}</p>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {slots.map((slot) => {
            const isSelected = selectedSlot?.label === slot.label;
            return (
              <button
                key={slot.id}
                type="button"
                onClick={() => onSelect(slot)}
                className={cn(
                  "relative h-10 rounded-lg border font-mono text-sm transition-all",
                  isSelected
                    ? "border-primary bg-brand-gradient text-white shadow-brand"
                    : "border-border-subtle bg-bg-card text-text-main hover:border-primary hover:bg-primary/5",
                )}
              >
                {slot.timeText}
                {slot.isHot ? (
                  <span
                    aria-hidden
                    className="absolute -right-1 -top-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-orange-500 text-[8px] font-bold text-white"
                  >
                    ★
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
