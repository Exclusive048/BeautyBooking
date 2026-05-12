import { UI_TEXT } from "@/lib/ui/text";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const DATE_FORMATTER = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
});

/**
 * Format a past ISO date as a short Russian relative-time string.
 * Examples: "только что", "12 мин назад", "3 ч назад", "вчера", "5 дн назад", "12 апр".
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const T = UI_TEXT.homeFeed.stories.relativeTime;
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return "";

  const diffMs = now.getTime() - target.getTime();
  if (diffMs < MINUTE_MS) return T.justNow;
  if (diffMs < HOUR_MS) {
    const n = Math.floor(diffMs / MINUTE_MS);
    return T.minutesAgo.replace("{n}", String(n));
  }
  if (diffMs < DAY_MS) {
    const n = Math.floor(diffMs / HOUR_MS);
    return T.hoursAgo.replace("{n}", String(n));
  }
  if (diffMs < 2 * DAY_MS) return T.yesterday;
  if (diffMs < 7 * DAY_MS) {
    const n = Math.floor(diffMs / DAY_MS);
    return T.daysAgo.replace("{n}", String(n));
  }
  return DATE_FORMATTER.format(target);
}
