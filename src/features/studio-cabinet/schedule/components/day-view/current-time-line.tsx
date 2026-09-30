"use client";

import { useEffect, useState } from "react";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import {
  gridHeightPx,
  offsetPxFromMinute,
  salonMinuteOfDay,
  type GridWindow,
} from "../../lib/time-grid";

/**
 * FIX-STUDIO-CALENDAR-SALON-TZ: the "now" marker is positioned by the
 * salon-local minute-of-day (matching the salon-local axis + booking
 * cells) and only shown when the viewed day IS today in the SALON's tz
 * — not the browser's. A Moscow admin viewing a +5 salon at 23:30 MSK
 * sees the line on the salon's "tomorrow" column, correctly.
 */
export function CurrentTimeLine({
  dateKey,
  timezone,
  gridWindow,
}: {
  dateKey: string;
  timezone: string;
  gridWindow: GridWindow;
}) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const interval = window.setInterval(tick, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  if (!now || toLocalDateKey(now, timezone) !== dateKey) return null;
  const top = offsetPxFromMinute(salonMinuteOfDay(now, timezone), gridWindow);
  if (top < 0 || top > gridHeightPx(gridWindow)) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
      style={{ top }}
    >
      <span className="h-2 w-2 -translate-x-1 rounded-full bg-destructive shadow-sm" />
      <span className="h-px flex-1 bg-destructive/80" />
    </div>
  );
}
