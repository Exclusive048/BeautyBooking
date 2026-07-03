"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";
import { assignLanes, laneStyle } from "@/lib/calendar/lane-layout";
import { HScrollShadow } from "@/components/ui/h-scroll-shadow";
import { BOOKING_CELL_CLASS } from "../../lib/booking-status-display";
import {
  GRID_HEIGHT_PX,
  SLOT_HEIGHT_PX,
  TOTAL_SLOTS,
  durationPx,
  formatTime,
  iterateSlotMinutes,
  offsetPxFromDayStart,
} from "../../lib/time-grid";
import type {
  ScheduleBookingCell,
  ScheduleBreakCell,
  ScheduleDayData,
} from "../../server/types";
import { BookingActionMenu } from "../dialogs/booking-action-menu";
import { CreateBookingDialog } from "../dialogs/create-booking-dialog";
import { CurrentTimeLine } from "./current-time-line";
import { DisabledMasterOverlay } from "./disabled-master-overlay";
import { MasterColumnHeader } from "./master-column-header";
import { TimeAxis } from "./time-axis";

const T = UI_TEXT.studioCabinet.scheduleV2;

type Props = {
  studioId: string;
  day: ScheduleDayData;
  services: Array<{
    id: string;
    name: string;
    durationMin: number;
    priceKopeks: number;
    masterIds: string[];
  }>;
  /**
   * STUDIO-MASTERS-PRIVACY-FIX-A: decoded master id from the
   * `?master=<token>` deep-link (verified server-side). When set, the
   * grid scrolls horizontally so this master's column is in view and
   * the column header gets a soft accent ring. Null/undefined means
   * "no deep-link" — grid renders normally.
   */
  focusMasterId?: string;
};

function localTimeShort(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DayGrid({ studioId, day, services, focusMasterId }: Props) {
  const [createSlot, setCreateSlot] = useState<{
    masterId: string;
    startAtUtc: string;
  } | null>(null);
  const [activeBooking, setActiveBooking] =
    useState<ScheduleBookingCell | null>(null);

  const slotMinutes = Array.from(iterateSlotMinutes());

  // STUDIO-MASTERS-PRIVACY-FIX-A: scroll the focused master's column
  // into view when the page arrives with a verified `?master=<token>`.
  // Mount-gated useEffect — runs once after hydration, no
  // SSR/CSR mismatch risk.
  const focusedColumnRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!focusMasterId || !focusedColumnRef.current) return;
    focusedColumnRef.current.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [focusMasterId]);

  const handleEmptyClick = (masterId: string, slotMinutesValue: number) => {
    const dayStart = new Date(day.dayStartIso);
    const start = new Date(dayStart);
    start.setUTCMinutes(slotMinutesValue);
    setCreateSlot({ masterId, startAtUtc: start.toISOString() });
  };

  if (day.columns.length === 0) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-bg-card p-8 text-center text-sm text-text-sec">
        {T.empty.noMasters}
      </div>
    );
  }

  return (
    <>
      {/* FIX-BATCH-E: HScrollShadow makes the horizontal scroll discoverable when
          more master columns exist than fit at ≤1280 (edge fade). The inner div
          stays the scroll parent so the sticky time axis / headers keep working. */}
      <HScrollShadow
        wrapperClassName="rounded-2xl border border-border-subtle bg-bg-card"
        scrollClassName="flex max-h-[70vh] overflow-auto"
      >
          {/* Time axis sticky left */}
          <div className="sticky left-0 z-30 bg-bg-card">
            <div className="h-12 border-b border-r border-border-subtle bg-bg-card" />
            <TimeAxis />
          </div>

          {/* Master columns */}
          <div className="flex">
            {day.columns.map((column) => {
              const bookingsForColumn = day.bookings.filter(
                (b) => b.masterId === column.id,
              );
              // FIX-BATCH-E: split overlapping bookings in this master's column
              // into side-by-side lanes (epoch-ms axis) — no more stacking.
              const columnLanes = assignLanes(
                bookingsForColumn.map((b) => ({
                  id: b.id,
                  start: new Date(b.startAtUtc).getTime(),
                  end: new Date(b.endAtUtc).getTime(),
                })),
              );
              const breaksForColumn = day.breaks.filter(
                (b) => b.masterId === column.id,
              );
              const dayStart = new Date(day.dayStartIso);
              const isFocused = focusMasterId === column.id;
              return (
                <div
                  key={column.id}
                  ref={isFocused ? focusedColumnRef : undefined}
                  className={cn(
                    "relative w-[200px] shrink-0 border-r border-border-subtle",
                    isFocused && "ring-2 ring-primary/40 ring-inset",
                  )}
                >
                  <div className="sticky top-0 z-20 h-12">
                    <MasterColumnHeader master={column} />
                  </div>
                  <div
                    className={cn(
                      "relative",
                      !column.isAvailable && "pointer-events-none",
                    )}
                    style={{ height: GRID_HEIGHT_PX }}
                  >
                    {/* Hour grid lines */}
                    {Array.from({ length: TOTAL_SLOTS }, (_, index) => (
                      <div
                        key={index}
                        className={cn(
                          "absolute inset-x-0 border-t",
                          index % 2 === 0
                            ? "border-border-subtle"
                            : "border-border-subtle/40",
                        )}
                        style={{ top: index * SLOT_HEIGHT_PX }}
                      />
                    ))}

                    {/* Empty cells (clickable) */}
                    {column.isAvailable
                      ? slotMinutes.map((m, index) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => handleEmptyClick(column.id, m)}
                            className="absolute inset-x-0 transition-colors hover:bg-primary/5"
                            style={{
                              top: index * SLOT_HEIGHT_PX,
                              height: SLOT_HEIGHT_PX,
                            }}
                            aria-label={`${formatTime(m)} — ${T.cell.emptyHint}`}
                          />
                        ))
                      : null}

                    {/* Break cells */}
                    {breaksForColumn.map((entry) => (
                      <BreakCell
                        key={entry.id}
                        entry={entry}
                        dayStart={dayStart}
                      />
                    ))}

                    {/* Booking cells */}
                    {bookingsForColumn.map((booking) => {
                      const start = new Date(booking.startAtUtc);
                      const end = new Date(booking.endAtUtc);
                      const { left, width } = laneStyle(columnLanes.get(booking.id));
                      return (
                        <button
                          key={booking.id}
                          type="button"
                          onClick={() => setActiveBooking(booking)}
                          className={cn(
                            "absolute z-10 overflow-hidden rounded-lg p-1.5 text-left text-[11px] leading-tight transition-shadow hover:shadow-sm",
                            BOOKING_CELL_CLASS[booking.tone],
                          )}
                          style={{
                            top: offsetPxFromDayStart(start, dayStart),
                            height: durationPx(start, end),
                            left,
                            width,
                          }}
                        >
                          <div className="font-mono text-[10px]">
                            {localTimeShort(booking.startAtUtc)} —{" "}
                            {localTimeShort(booking.endAtUtc)}
                          </div>
                          <div className="truncate font-semibold">
                            {booking.clientName || "—"}
                          </div>
                          <div className="truncate opacity-80">
                            {booking.serviceTitle}
                          </div>
                          {booking.priceKopeks > 0 ? (
                            <div className="mt-0.5 font-mono text-[10px] opacity-70">
                              {UI_FMT.priceLabel(booking.priceKopeks)}
                            </div>
                          ) : null}
                        </button>
                      );
                    })}

                    {/* Current time line */}
                    {column.isAvailable ? (
                      <CurrentTimeLine dayStartIso={day.dayStartIso} />
                    ) : null}

                    {/* Disabled overlay */}
                    {!column.isAvailable ? <DisabledMasterOverlay /> : null}
                  </div>
                </div>
              );
            })}
          </div>
      </HScrollShadow>

      {/* Create dialog */}
      <CreateBookingDialog
        studioId={studioId}
        open={createSlot !== null}
        masterId={createSlot?.masterId ?? null}
        masters={day.columns}
        services={services}
        startAtUtc={createSlot?.startAtUtc ?? null}
        onClose={() => setCreateSlot(null)}
      />

      {/* Action menu for booking */}
      <BookingActionMenu
        studioId={studioId}
        booking={activeBooking}
        masters={day.columns}
        onClose={() => setActiveBooking(null)}
      />
    </>
  );
}

function BreakCell({
  entry,
  dayStart,
}: {
  entry: ScheduleBreakCell;
  dayStart: Date;
}) {
  const start = new Date(entry.startAtUtc);
  const end = new Date(entry.endAtUtc);
  return (
    <div
      className="absolute left-1 right-1 z-[5] flex items-center justify-center rounded-lg border border-dashed border-border-subtle bg-bg-input/60 text-[11px] font-medium text-text-sec"
      style={{
        top: offsetPxFromDayStart(start, dayStart),
        height: durationPx(start, end),
      }}
      title={entry.note ?? undefined}
    >
      {T.cell.breakLabel}
    </div>
  );
}
