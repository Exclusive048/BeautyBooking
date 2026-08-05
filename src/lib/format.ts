export const LOCALE = "ru-RU";
export const CURRENCY = "RUB";

// NOTE (LEGACY-MONEY-UTILS-RETIRE 2026-07-01): the non-÷100 `moneyRUB` /
// `moneyRUBPlain` (took a rubles value, formatted without dividing) are gone —
// prices are stored in KOPEKS, so all money display goes through a ÷100
// formatter: `moneyRUBFromKopeks` / `moneyRUBPlainFromKopeks` here, or the
// canonical `UI_FMT.priceLabel` (src/lib/ui/fmt.ts). See MONEY-BRAND-TYPE-A.

export function moneyRUBFromKopeks(valueKopeks: number) {
  const value = valueKopeks / 100;
  const hasFraction = Math.abs(valueKopeks % 100) > 0;
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: CURRENCY,
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(value);
}

export function moneyRUBPlainFromKopeks(valueKopeks: number) {
  const value = valueKopeks / 100;
  const hasFraction = Math.abs(valueKopeks % 100) > 0;
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(value);
}

export function minutesToHuman(min: number) {
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

export function dateTimeRU(d: Date) {
  return new Intl.DateTimeFormat(LOCALE, {
    year: "numeric",
    month: "long",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/**
 * ⚠️ **VIEWER-TZ. Только клиентские поверхности** (rule 17).
 *
 * `timeZone` не передаётся сознательно — дата рендерится по часам зрителя, и
 * для биллинговых дат в кабинете это правильный источник: их читает владелец
 * кабинета в своём браузере.
 *
 * LOGIC-25: на СЕРВЕРЕ этого хелпера быть не должно. У cron-задачи браузерного
 * контекста нет вообще, и «ambient-tz» там означает `TZ` контейнера —
 * провайдер получал дату дедлайна, посчитанную по чужим часам. Для серверных
 * сообщений есть `billing/deadline-label.ts` (salon-tz + обязательная метка
 * зоны); запрет пиннится `billing/deadline-label.test.ts`.
 */
export function dateRU(d: Date) {
  // tz-ok: viewer — биллинговые даты в кабинете читает владелец кабинета.
  return new Intl.DateTimeFormat(LOCALE, {
    year: "numeric",
    month: "long",
    day: "2-digit",
  }).format(d);
}

export function timeRU(d: Date) {
  return new Intl.DateTimeFormat(LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
