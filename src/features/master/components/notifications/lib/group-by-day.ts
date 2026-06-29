import type { NotificationCenterNotificationItem } from "@/lib/notifications/center";
import { getDayOfWeek, toLocalDateKey } from "@/lib/schedule/timezone";

const WEEKDAY_LABELS = [
  "воскресенье",
  "понедельник",
  "вторник",
  "среда",
  "четверг",
  "пятница",
  "суббота",
] as const;

const MONTH_GENITIVE = [
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

export type NotificationDayGroup = {
  /** Stable key used as React key. `today` / `yesterday` / ISO date. */
  dayKey: string;
  /** Display label: «Сегодня» / «Вчера» / «28 апреля · вторник». */
  label: string;
  items: NotificationCenterNotificationItem[];
};

export type NotificationSort = "newest" | "oldest";

/** Process-TZ calendar key (legacy path — when no entity timeZone is given). */
function processYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// FIX-04 (QA-113): when `timeZone` is supplied (master/studio self-view), the
// day bucketing + "today"/"yesterday" must be computed in the recipient
// entity's own timezone, not the Node process TZ (UTC on prod). Falls back to
// the process TZ when no timeZone is given (no client callers exist today —
// the QA-107 per-viewer track owns client-facing groupings).
function dayKeyOf(date: Date, timeZone?: string): string {
  return timeZone ? toLocalDateKey(date, timeZone) : processYmd(date);
}

/** Calendar day before a `YYYY-MM-DD` key (TZ-agnostic — pure calendar math). */
function prevDayKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() - 1);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function describeDay(
  target: Date,
  today: Date,
  timeZone?: string,
): { key: string; label: string } {
  const targetKey = dayKeyOf(target, timeZone);
  const todayKey = dayKeyOf(today, timeZone);

  if (targetKey === todayKey) {
    return { key: "today", label: "Сегодня" };
  }
  if (targetKey === prevDayKey(todayKey)) {
    return { key: "yesterday", label: "Вчера" };
  }
  const [, mStr, dStr] = targetKey.split("-");
  const month = MONTH_GENITIVE[Number(mStr) - 1] ?? "";
  const weekdayIdx = timeZone ? getDayOfWeek(target, timeZone) : target.getDay();
  const weekday = WEEKDAY_LABELS[weekdayIdx] ?? "";
  return {
    key: targetKey,
    label: `${Number(dStr)} ${month} · ${weekday}`,
  };
}

/**
 * Splits notifications into day buckets ordered by the `sort` argument.
 * Within each bucket items are also sorted by `createdAt` according to
 * the same direction. `today` / `yesterday` are pinned to the top
 * regardless of sort direction in the "newest" mode; in "oldest" mode
 * older days come first naturally.
 */
export function groupNotificationsByDay(
  items: NotificationCenterNotificationItem[],
  sort: NotificationSort,
  now: Date = new Date(),
  timeZone?: string
): NotificationDayGroup[] {
  const groupsByKey = new Map<string, NotificationDayGroup>();

  for (const item of items) {
    const created = new Date(item.createdAt);
    const { key, label } = describeDay(created, now, timeZone);
    const existing = groupsByKey.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      groupsByKey.set(key, { dayKey: key, label, items: [item] });
    }
  }

  const groups = Array.from(groupsByKey.values());
  groups.sort((left, right) => {
    const leftDate = left.items[0]?.createdAt ?? "";
    const rightDate = right.items[0]?.createdAt ?? "";
    return sort === "newest"
      ? rightDate.localeCompare(leftDate)
      : leftDate.localeCompare(rightDate);
  });

  for (const group of groups) {
    group.items.sort((left, right) => {
      const cmp = right.createdAt.localeCompare(left.createdAt);
      return sort === "newest" ? cmp : -cmp;
    });
  }

  return groups;
}

const RU_PLURAL_RULES = new Intl.PluralRules("ru-RU");

export function pluralizeRu(
  n: number,
  one: string,
  few: string,
  many: string
): string {
  const form = RU_PLURAL_RULES.select(n);
  if (form === "one") return one;
  if (form === "few") return few;
  return many;
}
