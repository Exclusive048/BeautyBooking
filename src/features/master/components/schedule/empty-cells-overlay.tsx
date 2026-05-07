"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { UI_TEXT } from "@/lib/ui/text";

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
};

/**
 * Click-to-create layer rendered on top of a day column. Splits the
 * working window into 30-minute slots, masks out anything that overlaps
 * with a booking or time block, and turns the rest into clickable
 * pointer-events-auto buttons. The wrapper itself has
 * `pointer-events-none` so booking cards above stay interactive.
 *
 * Clicking a slot pushes the user to the dashboard's manual-booking modal
 * with a `prefillTime` query param that the modal reads and seeds into
 * its date+time fields.
 */
export function EmptyCellsOverlay({
  iso,
  hourStart,
  hourEnd,
  hourPx,
  workingIntervals,
  occupied,
}: Props) {
  const router = useRouter();
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
    const [y, m, d] = iso.split("-").map((p) => Number.parseInt(p, 10));
    if (!y || !m || !d) return;
    const startsAt = new Date(y, m - 1, d, Math.floor(startMin / 60), startMin % 60, 0, 0);
    const params = new URLSearchParams({
      manual: "1",
      prefillTime: startsAt.toISOString(),
    });
    router.push(`/cabinet/master/dashboard?${params.toString()}`);
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-[1]">
      {slots.map((slot) => {
        const top = (slot.startMin - hourStart * 60) * pxPerMin;
        const height = SLOT_MIN * pxPerMin;
        if (top < 0 || top + height > (hourEnd - hourStart) * hourPx) return null;
        return (
          <button
            key={`${iso}:${slot.startMin}`}
            type="button"
            onClick={() => handleClick(slot.startMin)}
            className="pointer-events-auto absolute inset-x-1 cursor-pointer rounded-md border border-transparent text-center text-[10px] font-medium text-primary opacity-0 transition-opacity hover:border-primary/30 hover:bg-primary/5 hover:opacity-100 focus-visible:opacity-100"
            style={{ top, height }}
          >
            {UI_TEXT.cabinetMaster.schedule.emptyCellHint}
          </button>
        );
      })}
    </div>
  );
}
