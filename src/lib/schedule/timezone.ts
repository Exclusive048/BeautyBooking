import type { DayOfWeek } from "@/lib/domain/schedule";

/**
 * Read-time fallback tz (HARDENING-06 FIX-10). Kept as a literal (NOT the `env`
 * import) so this module stays client-safe (rule 13) — it's imported by client
 * components via `formatLocalHm`. Mirrors `env.DEFAULT_TIMEZONE`.
 */
const FALLBACK_TIME_ZONE = "Europe/Moscow";

/**
 * Is `value` a formatter-usable IANA timezone? Write-time validation (FIX-10)
 * uses this in the studio/master PATCH schemas so a bad tz (e.g. `""`) can never
 * be stored; `partsFromDate` uses it as a read-time guard so a pre-existing bad
 * row degrades to the fallback instead of throwing `RangeError` on live
 * calendar/booking surfaces. Pure Intl → client-safe.
 */
export function isValidTimeZone(value: string): boolean {
  if (typeof value !== "string" || value.trim().length < 3) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const WEEKDAY_MAP: Record<string, DayOfWeek> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

/**
 * Форматтер частей даты на пояс. Кэш — ради горячих циклов (аналитика,
 * группировка записей по дням): конструктор `Intl.DateTimeFormat` на порядки
 * дороже `formatToParts`. Битый пояс из данных кэшируется вместе с fallback.
 */
const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = partsFormatters.get(timeZone);
  if (cached) return cached;
  const safeTimeZone = isValidTimeZone(timeZone) ? timeZone : FALLBACK_TIME_ZONE;
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: safeTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  partsFormatters.set(timeZone, dtf);
  return dtf;
}

function partsFromDate(date: Date, timeZone: string): DateParts {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error(
      `Invalid date in partsFromDate: ${String(date)} (type=${typeof date}, value=${JSON.stringify(date)})`
    );
  }
  // FIX-10 read-time guard: a bad stored tz (empty/garbage) would make the
  // `Intl.DateTimeFormat` constructor throw `RangeError` → 500 on live
  // calendar/booking surfaces. Write-time validation (schema) keeps new rows
  // clean; this degrades a pre-existing bad row to the fallback. Client-safe →
  // no `logError` here (rule 13); the schema rejection is the observable signal.
  const parts = partsFormatter(timeZone).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((p) => [p.type, p.value]));

  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
    second: Number(lookup.second),
  };
}

export function getLocalTimeParts(date: Date, timeZone: string): { hour: number; minute: number } {
  const parts = partsFromDate(date, timeZone);
  return { hour: parts.hour, minute: parts.minute };
}

/**
 * FIX-EXP-TZ-CROSS-SURFACE — the single entity-tz "HH:MM" formatter.
 *
 * The cross-surface contradiction class (EXP-017/019, the FIX-04/11/20/22
 * tail): surfaces formatted a stored-UTC booking/slot instant with a local
 * `formatHm` that read `date.getUTCHours()` (UTC) or `date.getHours()` (host
 * process tz) — so the same booking showed a different time on the dashboard
 * vs the kanban, and a week-card's label disagreed with its salon-tz grid
 * position. Both UTC and host-tz are wrong: appointment times must be shown in
 * the ENTITY's (salon's) own tz (QA-107 / FIX-22).
 *
 * `timeZone` is REQUIRED (no default) on purpose — a caller cannot accidentally
 * format in UTC/host tz and re-diverge. All booking/slot "HH:MM" displays route
 * through this one helper. Client-safe (Intl only, type-only import above).
 */
export function formatLocalHm(date: Date, timeZone: string): string {
  const { hour, minute } = getLocalTimeParts(date, timeZone);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = partsFromDate(date, timeZone);
  const utcFromParts = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return utcFromParts - date.getTime();
}

export function getDayOfWeek(date: Date, timeZone: string): DayOfWeek {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(date);

  return WEEKDAY_MAP[weekday] ?? 0;
}

export function toUtcFromLocalDateTime(
  date: Date,
  hours: number,
  minutes: number,
  timeZone: string
): Date {
  const utcGuess = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hours, minutes, 0));
  const offset = getTimeZoneOffsetMs(utcGuess, timeZone);
  return new Date(utcGuess.getTime() - offset);
}

function rejectDateKeyString(input: string): void {
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    throw new Error(`Date key string is not allowed in toLocalDateKey: ${input}`);
  }
}

export function toLocalDateKey(date: Date | number | string, timeZone: string): string {
  const value =
    typeof date === "string"
      ? (rejectDateKeyString(date), new Date(date))
      : typeof date === "number"
        ? new Date(date)
        : date;
  const parts = partsFromDate(value, timeZone);
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return `${parts.year}-${month}-${day}`;
}

/**
 * Месяц момента времени в поясе `timeZone` — ключ `YYYY-MM` (UTC-tech-ключ
 * группировки: когорты, «по месяцам»). Пояс обязателен, как у `toLocalDateKey`.
 */
export function toLocalMonthKey(date: Date | number | string, timeZone: string): string {
  return toLocalDateKey(date, timeZone).slice(0, 7);
}

export function toLocalDateKeyExclusive(date: Date, timeZone: string): string {
  const parts = partsFromDate(date, timeZone);
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  const dateKey = `${parts.year}-${month}-${day}`;
  const isLocalMidnight =
    parts.hour === 0 && parts.minute === 0 && parts.second === 0 && date.getUTCMilliseconds() === 0;
  if (isLocalMidnight) {
    return dateKey;
  }
  const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}
