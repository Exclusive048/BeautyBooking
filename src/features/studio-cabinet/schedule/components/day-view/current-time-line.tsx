"use client";

import { useEffect, useState } from "react";
import { isSameUtcDay, offsetPxFromDayStart } from "../../lib/time-grid";

export function CurrentTimeLine({ dayStartIso }: { dayStartIso: string }) {
  const dayStart = new Date(dayStartIso);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const interval = window.setInterval(tick, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  if (!now || !isSameUtcDay(now, dayStart)) return null;
  const top = offsetPxFromDayStart(now, dayStart);
  if (top < 0) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
      style={{ top }}
    >
      <span className="h-2 w-2 -translate-x-1 rounded-full bg-red-500 shadow-sm" />
      <span className="h-px flex-1 bg-red-500/80" />
    </div>
  );
}
