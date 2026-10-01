"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { fetchJson, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import { formatZoneLabel, zonesDifferForViewer } from "@/lib/ui/zone-label";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";
import type { BookingFlowSlot } from "@/features/booking/components/booking-flow/types";
import { Button } from "@/components/ui/button";

const T = UI_TEXT.publicProfile.bookingWidget;

type Props = {
  providerId: string;
  serviceId: string;
  dateKey: string;
  providerTimezone: string;
  selectedSlot: BookingFlowSlot | null;
  onSelect: (slot: BookingFlowSlot) => void;
  /**
   * PACKAGE-SOLO-WIZARD-01: earliest acceptable start (ISO instant). Slots
   * starting before it are dropped — the package wizard passes the previous
   * component's end + the master's buffer, so the client can never pick a time
   * that collides with their own earlier service. The slots API can't do this
   * itself: the sibling isn't committed yet, so its window still reads free.
   * Omitted for the single-service widget → no filtering (unchanged).
   */
  minStartAtUtc?: string | null;
  /** Empty-state copy override — the package wizard explains the cursor. */
  emptyLabel?: string;
  /**
   * Hot-slot badges. The package price comes from the package's own
   * proportional split (`resolveBookingCore` applies no hot-slot discount), so
   * the wizard hides the badge rather than promise a discount the package
   * doesn't give. Defaults on for the single-service widget (unchanged).
   */
  showHotBadges?: boolean;
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
  minStartAtUtc = null,
  emptyLabel,
  showHotBadges = true,
}: Props) {
  const [slots, setSlots] = useState<BookingFlowSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const viewerTz = useViewerTimeZoneContext();

  // QA-107/FIX-22: slot times are the SALON's local time. When the viewer's
  // zone differs, surface the explicit «(город, GMT+N)» label next to the time
  // header so they read the times against the salon's clock, not their own. Use
  // a real slot instant for a DST-correct offset.
  const refInstant = slots[0]?.startAtUtc ?? null;
  const zoneLabel =
    refInstant &&
    zonesDifferForViewer({
      iso: refInstant,
      salonTimeZone: providerTimezone,
      viewerTimeZone: viewerTz,
    })
      ? formatZoneLabel({ iso: refInstant, timeZone: providerTimezone })
      : "";

  const loadSlots = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // FIX-05 (QA-110): this grid shows ONE selected day. The slots API treats
      // `to` as inclusive, so `from === to === dateKey` returns exactly that
      // day — previously `to = dateKey + 1` pulled the next day's slots too,
      // which rendered intermixed with no day label (and the summary could
      // mislabel a next-day slot as the selected day).
      const url = new URL(
        `/api/public/providers/${providerId}/slots`,
        window.location.origin,
      );
      url.searchParams.set("serviceId", serviceId);
      url.searchParams.set("from", dateKey);
      url.searchParams.set("to", dateKey);
      const data = await fetchJson<{ slots: SlotPayload[] }>(url.toString(), { cache: "no-store" });
      const parsed: BookingFlowSlot[] = data.slots
        .map((slot) => ({
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
        }))
        // FIX-05 (QA-110): defensive — only the selected provider-local day.
        // `dayKey` is the slot's day in the provider's timezone; with the
        // single-day request above this is already exact, but the filter
        // guards any midnight-boundary edge.
        .filter((slot) => slot.dayKey === dateKey);
      setSlots(parsed);
    } catch (error) {
      setError(serverMessageOr(error, UI_TEXT.publicProfile.slots.loadFailed));
    } finally {
      setLoading(false);
    }
  }, [dateKey, providerId, providerTimezone, serviceId]);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);

  // Cursor filter at render (not in the fetch) — the day's slots are the same
  // regardless of the floor, so re-picking an earlier component doesn't refetch.
  const visibleSlots = useMemo(() => {
    if (!minStartAtUtc) return slots;
    const floorMs = new Date(minStartAtUtc).getTime();
    if (Number.isNaN(floorMs)) return slots;
    return slots.filter((slot) => new Date(slot.startAtUtc).getTime() >= floorMs);
  }, [slots, minStartAtUtc]);

  return (
    <div>
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-1.5 text-2xs font-medium uppercase tracking-wider text-text-sec">
        <span>{T.timeLabel}</span>
        {zoneLabel ? (
          <span className="font-mono normal-case text-accent-text">{zoneLabel}</span>
        ) : null}
      </div>
      {loading ? (
        <div className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="h-10 animate-pulse rounded-lg bg-bg-input" />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-text-sec">{error}</p>
      ) : visibleSlots.length === 0 ? (
        // QA-122 (FIX-10): accurate empty state. If the selected day is today
        // (provider tz) and 0 slots remain, the booking window has passed →
        // distinct copy from a generic fully-booked / day-off message.
        // PACKAGE-SOLO-WIZARD-01: `emptyLabel` overrides both when the cursor
        // (not availability) is what emptied the day.
        <p className="text-sm italic text-text-sec">
          {emptyLabel ??
            (dateKey === toLocalDateKey(new Date().toISOString(), providerTimezone)
              ? T.emptyDayToday
              : T.emptyDay)}
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {visibleSlots.map((slot) => {
            const isSelected = selectedSlot?.label === slot.label;
            return (
              <Button variant="wrapper" aria-pressed={isSelected}
                key={slot.id}
                onClick={() => onSelect(slot)}
                className={cn(
                  "relative h-10 rounded-lg border font-mono text-sm transition-all",
                  isSelected
                    ? "border-primary bg-brand-gradient text-white shadow-brand"
                    : "border-border-subtle bg-bg-card text-text-main hover:border-primary hover:bg-primary/5",
                )}
              >
                {slot.timeText}
                {showHotBadges && slot.isHot ? (
                  <span
                    aria-hidden
                    className="absolute -right-1 -top-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-hot text-3xs font-bold text-white"
                  >
                    ★
                  </span>
                ) : null}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
