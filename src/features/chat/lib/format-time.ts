import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.chat;

const WEEKDAY_SHORT = T.weekdayShort;
const MONTHS_GENITIVE = T.monthsGenitive;

function sameLocalDay(a: Date, b: Date, timezone: string): boolean {
  return localDateKey(a, timezone) === localDateKey(b, timezone);
}

export function localDateKey(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: timezone,
  }).format(date);
}

/** "10:42" — local HH:MM in the viewer's timezone. */
export function formatTimeHm(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  }).format(date);
}

/**
 * Conversation-row time label.
 *
 *   - same day      → "10:42"
 *   - yesterday     → "вчера"
 *   - within 6 days → "пн"
 *   - earlier       → "5 мая"
 */
export function formatRowTime(isoOrDate: string | Date, timezone: string, now = new Date()): string {
  const date = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(date.getTime())) return "";

  if (sameLocalDay(date, now, timezone)) return formatTimeHm(date, timezone);

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameLocalDay(date, yesterday, timezone)) return T.row.yesterday;

  const diffMs = now.getTime() - date.getTime();
  const daysAgo = diffMs / 86_400_000;
  if (daysAgo < 7 && daysAgo > 0) {
    const weekdayIdx = jsWeekdayToIso(date.getDay());
    return WEEKDAY_SHORT[weekdayIdx] ?? "";
  }

  const day = date.getDate();
  const month = MONTHS_GENITIVE[date.getMonth()] ?? "";
  return `${day} ${month}`;
}

/** Day-separator label — "Сегодня", "Вчера", "Пятница, 9 мая". */
export function formatDaySeparator(dateKey: string, timezone: string, now = new Date()): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  if (sameLocalDay(date, now, timezone)) return T.day.today;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameLocalDay(date, yesterday, timezone)) return T.day.yesterday;

  const weekday = new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    timeZone: timezone,
  }).format(date);
  const day = date.getUTCDate();
  const month = MONTHS_GENITIVE[(m ?? 1) - 1] ?? "";
  return `${capitalize(weekday)}, ${day} ${month}`;
}

function jsWeekdayToIso(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1;
}

function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}
