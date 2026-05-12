import type { NotificationCenterNotificationItem } from "@/lib/notifications/center";

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

function ymd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function describeDay(target: Date, today: Date): { key: string; label: string } {
  const targetStart = startOfDay(target);
  const todayStart = startOfDay(today);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  if (targetStart.getTime() === todayStart.getTime()) {
    return { key: "today", label: "Сегодня" };
  }
  if (targetStart.getTime() === yesterdayStart.getTime()) {
    return { key: "yesterday", label: "Вчера" };
  }
  const month = MONTH_GENITIVE[target.getMonth()] ?? "";
  const weekday = WEEKDAY_LABELS[target.getDay()] ?? "";
  return {
    key: ymd(target),
    label: `${target.getDate()} ${month} · ${weekday}`,
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
  now: Date = new Date()
): NotificationDayGroup[] {
  const groupsByKey = new Map<string, NotificationDayGroup>();

  for (const item of items) {
    const created = new Date(item.createdAt);
    const { key, label } = describeDay(created, now);
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
