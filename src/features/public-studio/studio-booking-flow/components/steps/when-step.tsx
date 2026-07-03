"use client";

import { ArrowLeft, Calendar as CalendarIcon } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";
import { formatZoneLabel, zonesDifferForViewer } from "@/lib/ui/zone-label";
import type { SlotItem } from "@/features/booking/lib/studio-booking";
import { todayKey, buildDateBounds, STUDIO_BOOKING_DAYS_AHEAD } from "@/features/booking/lib/studio-booking";

type DayCell = {
  dateKey: string;
  label: string;
  day: number;
  month: string;
  isToday: boolean;
  isTomorrow: boolean;
  isWeekend: boolean;
};

const DOW = UI_TEXT.bookingWidget.whenStep.daysOfWeek;
const MONTH = UI_TEXT.bookingWidget.whenStep.months;

function buildStrip(daysAhead: number): DayCell[] {
  const out: DayCell[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < daysAhead; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    out.push({
      dateKey: `${yyyy}-${mm}-${dd}`,
      label:
        i === 0
          ? UI_TEXT.bookingWidget.whenStep.today
          : i === 1
          ? UI_TEXT.bookingWidget.whenStep.tomorrow
          : DOW[d.getDay()]!.toUpperCase(),
      day: d.getDate(),
      month: MONTH[d.getMonth()]!,
      isToday: i === 0,
      isTomorrow: i === 1,
      isWeekend: d.getDay() === 0 || d.getDay() === 6,
    });
  }
  return out;
}

type Props = {
  slots: SlotItem[];
  loading: boolean;
  selectedDate: string;
  onDateChange: (dateKey: string) => void;
  selectedSlotLabel: string;
  onSlotChange: (label: string) => void;
  /** Salon (provider) timezone — every slot time is rendered in this zone. */
  salonTimeZone: string;
  /** Viewer's browser zone — only used to decide whether to show the zone label. */
  viewerTimeZone: string;
  selectedMasterName: string;
  isAnyMaster: boolean;
  visibleSlotDays: number;
  onBack: () => void;
};

export function WhenStep({
  slots,
  loading,
  selectedDate,
  onDateChange,
  selectedSlotLabel,
  onSlotChange,
  salonTimeZone,
  viewerTimeZone,
  selectedMasterName,
  isAnyMaster,
  visibleSlotDays,
  onBack,
}: Props) {
  const daysAhead = Math.max(1, Math.min(visibleSlotDays || STUDIO_BOOKING_DAYS_AHEAD, STUDIO_BOOKING_DAYS_AHEAD));
  const strip = useMemo(() => buildStrip(daysAhead), [daysAhead]);
  const bounds = useMemo(() => buildDateBounds(new Date(), daysAhead), [daysAhead]);

  // Group slots into morning / day / evening by the SALON's local hour (a slot
  // at 13:00 salon-time is "День" in the salon's day, regardless of the viewer's
  // zone) — FIX-BATCH-C Defect 1.
  const grouped = useMemo(() => {
    const morning: SlotItem[] = [];
    const day: SlotItem[] = [];
    const evening: SlotItem[] = [];
    for (const slot of slots) {
      const date = new Date(slot.startAtUtc);
      const hour = Number(
        new Intl.DateTimeFormat("ru-RU", {
          timeZone: salonTimeZone,
          hour: "2-digit",
          hour12: false,
        }).format(date),
      );
      if (hour < 12) morning.push(slot);
      else if (hour < 16) day.push(slot);
      else evening.push(slot);
    }
    return { morning, day: day, evening };
  }, [slots, salonTimeZone]);

  // Salon-tz «(город, GMT+N)» label — shown when the viewer's zone differs from
  // the salon's, so a cross-tz client reads the salon-local clock correctly.
  const zoneLabel =
    slots.length > 0 &&
    zonesDifferForViewer({ iso: slots[0]!.startAtUtc, salonTimeZone, viewerTimeZone })
      ? formatZoneLabel({ iso: slots[0]!.startAtUtc, timeZone: salonTimeZone })
      : "";

  return (
    <section className="space-y-4">
      <header className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
          <CalendarIcon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-semibold text-text sm:text-xl">
            {UI_TEXT.bookingWidget.whenStep.title}
          </h2>
          <p className="truncate text-xs text-text-muted sm:text-sm">
            {isAnyMaster
              ? UI_TEXT.bookingWidget.whenStep.subtitleAny
              : UI_TEXT.bookingWidget.whenStep.subtitleMaster.replace("{master}", selectedMasterName)}
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onBack} className="text-text-muted">
          <ArrowLeft className="mr-1 h-3.5 w-3.5" aria-hidden />
          {UI_TEXT.bookingWidget.whenStep.back}
        </Button>
      </header>

      <div className="-mx-1 overflow-x-auto">
        <ul className="flex min-w-full snap-x snap-mandatory gap-2 px-1 pb-1">
          {strip.map((cell) => {
            const isSelected = cell.dateKey === selectedDate;
            const inBounds = cell.dateKey >= bounds.min && cell.dateKey <= bounds.max;
            return (
              <li key={cell.dateKey} className="snap-start">
                <button
                  type="button"
                  onClick={() => inBounds && onDateChange(cell.dateKey)}
                  disabled={!inBounds}
                  aria-pressed={isSelected}
                  className={`flex h-[68px] w-16 flex-col items-center justify-center rounded-xl border text-center transition ${
                    isSelected
                      ? "border-primary bg-primary text-white"
                      : "border-border-subtle bg-bg-card text-text hover:border-primary/60"
                  } ${!inBounds ? "opacity-40" : ""}`}
                >
                  <span
                    className={`font-mono text-[10px] uppercase tracking-wider ${
                      isSelected ? "text-white/90" : cell.isWeekend ? "text-primary" : "text-text-muted"
                    }`}
                  >
                    {cell.label}
                  </span>
                  <span className={`font-display text-lg font-semibold ${isSelected ? "text-white" : ""}`}>
                    {cell.day}
                  </span>
                  <span className={`text-[10px] ${isSelected ? "text-white/80" : "text-text-muted"}`}>
                    {cell.month}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {loading ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {Array.from({ length: 9 }).map((_, idx) => (
            <div key={idx} className="h-9 animate-pulse rounded-lg bg-bg-muted/60" />
          ))}
        </div>
      ) : slots.length === 0 ? (
        <div className="rounded-xl border border-border-subtle bg-bg-muted/40 p-8 text-center text-sm text-text-muted">
          {UI_TEXT.bookingWidget.whenStep.noSlots}
        </div>
      ) : (
        <div className="space-y-4">
          {zoneLabel ? (
            <p className="flex items-center gap-1 text-xs font-medium text-primary">
              <CalendarIcon className="h-3 w-3 shrink-0" aria-hidden />
              <span>
                {UI_TEXT.bookingWidget.whenStep.salonTimeNote} {zoneLabel}
              </span>
            </p>
          ) : null}
          <SlotGroup
            label={UI_TEXT.bookingWidget.whenStep.morning}
            slots={grouped.morning}
            selectedLabel={selectedSlotLabel}
            onPick={onSlotChange}
            salonTimeZone={salonTimeZone}
          />
          <SlotGroup
            label={UI_TEXT.bookingWidget.whenStep.day}
            slots={grouped.day}
            selectedLabel={selectedSlotLabel}
            onPick={onSlotChange}
            salonTimeZone={salonTimeZone}
          />
          <SlotGroup
            label={UI_TEXT.bookingWidget.whenStep.evening}
            slots={grouped.evening}
            selectedLabel={selectedSlotLabel}
            onPick={onSlotChange}
            salonTimeZone={salonTimeZone}
          />
        </div>
      )}

      <p className="sr-only">{todayKey()}</p>
    </section>
  );
}

function SlotGroup({
  label,
  slots,
  selectedLabel,
  onPick,
  salonTimeZone,
}: {
  label: string;
  slots: SlotItem[];
  selectedLabel: string;
  onPick: (label: string) => void;
  salonTimeZone: string;
}) {
  if (slots.length === 0) return null;
  return (
    <div>
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">{label}</div>
      <div className="flex flex-wrap gap-2">
        {slots.map((slot) => {
          const isSelected = slot.label === selectedLabel;
          return (
            <button
              key={slot.label}
              type="button"
              onClick={() => onPick(slot.label)}
              aria-pressed={isSelected}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                isSelected
                  ? "border-primary bg-primary text-white"
                  : "border-border-subtle bg-bg-card text-text hover:border-primary/60"
              }`}
            >
              {UI_FMT.timeShort(slot.startAtUtc, { timeZone: salonTimeZone })}
            </button>
          );
        })}
      </div>
    </div>
  );
}
