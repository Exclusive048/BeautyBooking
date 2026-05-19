export type BookingsTimeRange = "today" | "tomorrow" | "week" | "all";

export function parseBookingsTimeRange(value: unknown): BookingsTimeRange {
  return value === "tomorrow" || value === "week" || value === "all"
    ? value
    : "today";
}

function startOfUtcDay(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function addUtcDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/**
 * Translates a time-range chip into a `{ from, toExclusive }` window
 * relative to "now". `"all"` returns null bounds — the caller should
 * skip the filter entirely. Bounds are UTC instants; the journal page
 * runs server-side so no timezone normalisation is needed here.
 */
export function bookingsTimeRangeBounds(
  range: BookingsTimeRange,
  now: Date = new Date(),
): { from: Date | null; toExclusive: Date | null } {
  const today = startOfUtcDay(now);
  switch (range) {
    case "today":
      return { from: today, toExclusive: addUtcDays(today, 1) };
    case "tomorrow":
      return { from: addUtcDays(today, 1), toExclusive: addUtcDays(today, 2) };
    case "week":
      return { from: today, toExclusive: addUtcDays(today, 7) };
    case "all":
    default:
      return { from: null, toExclusive: null };
  }
}
