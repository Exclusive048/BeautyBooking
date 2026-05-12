/**
 * Russian-localised relative time formatter for notification cards.
 * Granularity: «только что» (<1 мин), «N мин назад», «N ч назад»,
 * «N дн назад». Uses `Intl.PluralRules` for correct one/few/many endings.
 *
 * Caller passes `now` to keep server- and client-side renders consistent
 * during the React hydration window — pass `Date.now()` from the server
 * via a prop or accept the default and live with a potential 1-second
 * mismatch right after page load.
 */

const RU_PLURAL = new Intl.PluralRules("ru-RU");

const FORMS = {
  minute: { one: "минуту", few: "минуты", many: "минут" },
  hour: { one: "час", few: "часа", many: "часов" },
  day: { one: "день", few: "дня", many: "дней" },
} as const;

function pick(n: number, table: { one: string; few: string; many: string }): string {
  const form = RU_PLURAL.select(n);
  if (form === "one") return table.one;
  if (form === "few") return table.few;
  return table.many;
}

export function formatTimeAgo(iso: string, now: Date = new Date()): string {
  const target = new Date(iso).getTime();
  const diffSec = Math.max(0, Math.floor((now.getTime() - target) / 1000));
  if (diffSec < 60) return "только что";

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} ${pick(diffMin, FORMS.minute)} назад`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} ${pick(diffHr, FORMS.hour)} назад`;

  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} ${pick(diffDay, FORMS.day)} назад`;
}
