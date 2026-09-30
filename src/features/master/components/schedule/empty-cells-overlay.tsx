"use client";

import { useMemo } from "react";
import { useManualBooking } from "@/features/master/components/manual-booking/manual-booking-provider";
import { salonInputToUtcIso } from "@/lib/schedule/datetime-input";
import * as UI_TEXT from "@/lib/ui/text";
import { Button } from "@/components/ui/button";

const SLOT_MIN = 30;

type Interval = { startMin: number; endMin: number };

type Props = {
  /** ISO date key for the day this overlay belongs to. */
  iso: string;
  hourStart: number;
  hourEnd: number;
  hourPx: number;
  workingIntervals: Interval[];
  occupied: Interval[];
  /**
   * LOGIC-21 · tz-источник — **salon-tz** (`Provider.timezone` мастера, тот же,
   * что позиционирует сетку через `minuteOfDay(startAtUtc, master.timezone)`).
   * Обязателен: `startMin` — salon-local минуты, и без зоны их не превратить в
   * UTC-инстант ничем, кроме таймзоны браузера.
   */
  timezone: string;
};

/**
 * Click-to-create layer rendered on top of a day column. Splits the
 * working window into 30-minute slots, masks out anything that overlaps
 * with a booking or time block, and turns the rest into clickable
 * pointer-events-auto buttons. The wrapper itself has
 * `pointer-events-none` so booking cards above stay interactive.
 *
 * Clicking a slot opens the manual-booking modal **inline on the current
 * route** (fix-01) — previously navigated to /dashboard. `prefillTime`
 * pre-fills the modal's date+time fields.
 */
export function EmptyCellsOverlay({
  iso,
  hourStart,
  hourEnd,
  hourPx,
  workingIntervals,
  occupied,
  timezone,
}: Props) {
  const { open: openManualBooking } = useManualBooking();
  const pxPerMin = hourPx / 60;

  const slots = useMemo(() => {
    const result: Array<{ startMin: number; endMin: number }> = [];
    for (const w of workingIntervals) {
      for (let m = w.startMin; m + SLOT_MIN <= w.endMin; m += SLOT_MIN) {
        const conflict = occupied.some((o) => m < o.endMin && m + SLOT_MIN > o.startMin);
        if (!conflict) result.push({ startMin: m, endMin: m + SLOT_MIN });
      }
    }
    return result;
  }, [workingIntervals, occupied]);

  if (slots.length === 0) return null;

  const handleClick = (startMin: number) => {
    // LOGIC-21: `iso` — salon-local день колонки, `startMin` — salon-local
    // минуты (ровно то, что мастер видит на сетке). Раньше их складывал
    // семиаргументный `new Date(...)`, который трактует wall-clock как
    // браузерный: у московского админа екатеринбургской студии клик по «13:00»
    // сохранялся как 15:00 по салону. Сборка идёт через общий salon-local
    // конвертер — тот же, что у студийных диалогов.
    const pad = (n: number) => String(n).padStart(2, "0");
    const salonLocal = `${iso}T${pad(Math.floor(startMin / 60))}:${pad(startMin % 60)}`;
    const prefillTime = salonInputToUtcIso(salonLocal, timezone);
    if (!prefillTime) return;
    openManualBooking({ prefillTime });
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-1">
      {slots.map((slot) => {
        const top = (slot.startMin - hourStart * 60) * pxPerMin;
        const height = SLOT_MIN * pxPerMin;
        if (top < 0 || top + height > (hourEnd - hourStart) * hourPx) return null;
        return (
          <Button variant="wrapper"
            key={`${iso}:${slot.startMin}`}
            onClick={() => handleClick(slot.startMin)}
            className="pointer-events-auto absolute inset-x-1 cursor-pointer rounded-md border border-transparent text-center text-[10px] font-medium text-accent-text opacity-0 transition-opacity hover:border-primary/30 hover:bg-primary/5 hover:opacity-100 focus-visible:opacity-100"
            style={{ top, height }}
          >
            {UI_TEXT.cabinetMaster.schedule.emptyCellHint}
          </Button>
        );
      })}
    </div>
  );
}
