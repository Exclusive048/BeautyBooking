export const LOCALE = "ru-RU";
export const CURRENCY = "RUB";

export function moneyRUB(value: number) {
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: CURRENCY,
    maximumFractionDigits: 0,
  }).format(value);
}

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

export function moneyRUBPlain(value: number) {
  return new Intl.NumberFormat(LOCALE, {
    maximumFractionDigits: 0,
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

export function dateRU(d: Date) {
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
