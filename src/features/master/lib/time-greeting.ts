/**
 * Russian time-of-day greeting for the master dashboard hero. Brackets follow
 * everyday speech: "доброй ночи" up to 6:00, "доброе утро" until noon, etc.
 */
export function getTimeGreeting(date: Date = new Date()): string {
  const hour = date.getHours();
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

/** "Суббота, 2 мая" — eyebrow above the greeting hero. */
export function formatHeroDate(date: Date): string {
  const weekday = WEEKDAYS_FULL[date.getDay()] ?? "";
  const day = date.getDate();
  const month = MONTHS_GENITIVE[date.getMonth()] ?? "";
  return `${weekday}, ${day} ${month}`;
}

/** Whole minutes from `now` until `target`. Negative when target is in the past. */
export function minutesUntil(target: Date, now: Date = new Date()): number {
  return Math.round((target.getTime() - now.getTime()) / 60000);
}
