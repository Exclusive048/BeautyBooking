import { getDayOfWeek, getLocalTimeParts, toLocalDateKey } from "@/lib/schedule/timezone";

/**
 * Russian time-of-day greeting for the master dashboard hero. Brackets follow
 * everyday speech: "доброй ночи" up to 6:00, "доброе утро" until noon, etc.
 *
 * Час — в поясе КАБИНЕТА мастера (29.09 доработки · 24): герой рендерится на
 * сервере, и `getHours()` читал часы контейнера — мастер в Москве получал
 * «Доброе утро» в час дня.
 */
export function getTimeGreeting(date: Date, timeZone: string): string {
  const { hour } = getLocalTimeParts(date, timeZone);
  if (hour < 6) return "Доброй ночи";
  if (hour < 12) return "Доброе утро";
  if (hour < 18) return "Добрый день";
  return "Добрый вечер";
}

const WEEKDAYS_FULL = [
  "воскресенье",
  "понедельник",
  "вторник",
  "среда",
  "четверг",
  "пятница",
  "суббота",
] as const;

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

/** "Суббота, 2 мая" — eyebrow above the greeting hero; дата — в поясе кабинета. */
export function formatHeroDate(date: Date, timeZone: string): string {
  const weekday = WEEKDAYS_FULL[getDayOfWeek(date, timeZone)] ?? "";
  const [, month, day] = toLocalDateKey(date, timeZone).split("-").map(Number);
  return `${weekday}, ${day} ${MONTHS_GENITIVE[(month ?? 1) - 1] ?? ""}`;
}

/** Whole minutes from `now` until `target`. Negative when target is in the past. */
export function minutesUntil(target: Date, now: Date = new Date()): number {
  return Math.round((target.getTime() - now.getTime()) / 60000);
}
