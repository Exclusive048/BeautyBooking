import { addDaysToDateKey } from "@/lib/schedule/dateKey";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import { UI_FMT } from "@/lib/ui/fmt";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.chat;

const WEEKDAY_SHORT = T.weekdayShort;
const MONTHS_GENITIVE = T.monthsGenitive;

function sameLocalDay(a: Date, b: Date, timezone: string): boolean {
  return toLocalDateKey(a, timezone) === toLocalDateKey(b, timezone);
}

/** "10:42" — local HH:MM in the viewer's timezone. */
export function formatTimeHm(date: Date, timezone: string): string {
  return UI_FMT.timeShort(date, { timeZone: timezone });
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
  // `dateKey` — уже дата в поясе `timezone`: сравниваем ключи, а не моменты.
  const todayKey = toLocalDateKey(now, timezone);
  if (dateKey === todayKey) return T.day.today;
  if (dateKey === addDaysToDateKey(todayKey, -1)) return T.day.yesterday;

  const [, m, d] = dateKey.split("-").map(Number);
  const weekday = UI_FMT.dateKey(dateKey, "weekdayLong");
  const month = MONTHS_GENITIVE[(m ?? 1) - 1] ?? "";
  return `${capitalize(weekday)}, ${d ?? ""} ${month}`;
}

function jsWeekdayToIso(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1;
}

function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}
