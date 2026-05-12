import type { BreakDto } from "@/lib/schedule/editor-shared";

const DAY_MINUTES = 24 * 60;

function toMinutes(time: string): number | null {
  const parts = time.split(":");
  if (parts.length !== 2) return null;
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Net work hours for a single day: (end − start) − Σ break durations,
 * rounded to the nearest integer hour. Returns 0 when the inputs are
 * malformed or the result would be negative.
 *
 * Edge cases handled:
 * - Overnight schedules (`end < start`) — the wrap is added to keep the
 *   gross positive. Server validation already forbids `start >= end`,
 *   but defensive in case a mid-edit draft transiently crosses
 *   midnight (rare with `<input type="time">`).
 * - Adjacent or zero-length breaks — treated as 0 minutes, no error.
 * - Breaks whose times can't parse — silently skipped (the server-side
 *   normaliser is the source of truth on validity).
 */
export function computeNetHours(
  startTime: string,
  endTime: string,
  breaks: ReadonlyArray<BreakDto>,
): number {
  const startMin = toMinutes(startTime);
  const endMin = toMinutes(endTime);
  if (startMin === null || endMin === null) return 0;

  const grossMin =
    endMin > startMin ? endMin - startMin : endMin + DAY_MINUTES - startMin;

  const breakMin = breaks.reduce<number>((sum, row) => {
    const br0 = toMinutes(row.start);
    const br1 = toMinutes(row.end);
    if (br0 === null || br1 === null || br1 <= br0) return sum;
    return sum + (br1 - br0);
  }, 0);

  const net = grossMin - breakMin;
  if (net <= 0) return 0;
  return Math.round(net / 60);
}
