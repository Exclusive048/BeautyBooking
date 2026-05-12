// Pure date utilities for the master schedule week view. All times are
// computed in UTC and the master timezone — display formatting is left to
// the calling component (so KPI cards, the kanban subtitle, and the page
// header can all reuse the raw values without re-parsing strings).

const WEEKDAYS_SHORT = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"] as const;
const MONTHS_GENITIVE = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
] as const;

export type WeekDay = {
  /** Local date object aligned to 00:00 of the day. */
  date: Date;
  /** YYYY-MM-DD ISO date key. */
  iso: string;
  /** Cyrillic short weekday — "ПН" / "ВТ" / ... */
  shortLabel: string;
  /** Day-of-month number (1-31). */
  dayNumber: number;
  /** "апр" / "мая" — short month label for sub-line. */
  monthShort: string;
  /** True if the day matches "now" (server-side reference). */
  isToday: boolean;
  /** ISO weekday: 0 = Sun … 6 = Sat. */
  weekday: number;
};

/** Format YYYY-MM-DD from a local Date without timezone shifts. */
export function toIsoDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Strip a Date down to local 00:00:00.000. */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * ISO-week-aligned start of the week — Monday at 00:00. Russian-locale
 * convention everywhere in the app.
 */
export function getWeekStart(reference: Date = new Date()): Date {
  const d = startOfDay(reference);
  const weekday = d.getDay(); // 0 = Sun
  const offset = weekday === 0 ? -6 : 1 - weekday; // shift to Monday
  d.setDate(d.getDate() + offset);
  return d;
}

/** Add N weeks (positive or negative) to a Date. */
export function addWeeks(date: Date, weeks: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + 7 * weeks);
  return next;
}

/**
 * Parse a `?weekStart=YYYY-MM-DD` URL value. Falls back to the current
 * Monday if the param is missing or malformed.
 */
export function parseWeekStart(value: string | undefined): Date {
  if (!value) return getWeekStart();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return getWeekStart();
  const [y, m, d] = value.split("-").map((p) => Number.parseInt(p, 10));
  if (!y || !m || !d) return getWeekStart();
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return getWeekStart();
  return startOfDay(dt);
}

/** Build the seven `WeekDay` rows for a given Monday-aligned `weekStart`. */
export function getWeekDays(weekStart: Date, now: Date = new Date()): WeekDay[] {
  const todayIso = toIsoDateKey(startOfDay(now));
  const days: WeekDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const iso = toIsoDateKey(d);
    days.push({
      date: d,
      iso,
      shortLabel: (WEEKDAYS_SHORT[d.getDay()] ?? "").toUpperCase(),
      dayNumber: d.getDate(),
      monthShort: (MONTHS_GENITIVE[d.getMonth()] ?? "").slice(0, 3),
      isToday: iso === todayIso,
      weekday: d.getDay(),
    });
  }
  return days;
}

/** "14 — 20 апреля 2026" — week-range label for the page subtitle. */
export function formatWeekRange(weekStart: Date): string {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  const startMonth = MONTHS_GENITIVE[weekStart.getMonth()] ?? "";
  const endMonth = MONTHS_GENITIVE[end.getMonth()] ?? "";
  if (weekStart.getMonth() === end.getMonth()) {
    return `${weekStart.getDate()} — ${end.getDate()} ${endMonth} ${end.getFullYear()}`;
  }
  return `${weekStart.getDate()} ${startMonth} — ${end.getDate()} ${endMonth} ${end.getFullYear()}`;
}

/** Convert a `HH:mm` working-time string into minutes-since-midnight. */
export function hhmmToMinutes(hhmm: string): number {
  const [hStr, mStr] = hhmm.split(":");
  const h = Number.parseInt(hStr ?? "", 10);
  const m = Number.parseInt(mStr ?? "", 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

/** "HH:mm" formatter for absolute Date instances rendered in master tz. */
export function formatHm(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}
