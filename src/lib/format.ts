// РФ: локаль и валюта
export const LOCALE = "ru-RU";
export const CURRENCY = "RUB";

export function moneyRUB(value: number) {
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: CURRENCY,
    maximumFractionDigits: 0,
  }).format(value);
}

// Удобно, если иногда надо без знака ₽
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
