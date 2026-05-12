import { UI_TEXT } from "@/lib/ui/text";

type DateFormatOptions = { locale?: string; timeZone?: string };

const DEFAULT_LOCALE = "ru-RU";
const FALLBACK_LABEL = "\u2014";

function resolveLocale(locale?: string): string {
  const trimmed = locale?.trim();
  return trimmed ? trimmed : DEFAULT_LOCALE;
}

function parseIsoDate(iso: string): Date | null {
  if (!iso || !iso.trim()) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatDateParts(
  date: Date,
  locale: string,
  timeZone: string | undefined,
  includeYear: boolean
): { day: string; month: string; year?: string } {
  const options: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    ...(includeYear ? { year: "numeric" } : {}),
  };
  if (timeZone) {
    options.timeZone = timeZone;
  }
  const parts = new Intl.DateTimeFormat(locale, options).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    day: map.day ?? "00",
    month: map.month ?? "00",
    ...(includeYear ? { year: map.year ?? "0000" } : {}),
  };
}

function formatTimeParts(
  date: Date,
  locale: string,
  timeZone: string | undefined
): { hour: string; minute: string } {
  const options: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };
  if (timeZone) {
    options.timeZone = timeZone;
  }
  const parts = new Intl.DateTimeFormat(locale, options).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { hour: map.hour ?? "00", minute: map.minute ?? "00" };
}

export const UI_FMT = {
  inviteTitle(studioName: string): string {
    return `Приглашение от ${studioName}`;
  },
  notificationTimeLabel(iso: string, opts?: DateFormatOptions): string {
    return UI_FMT.dateTimeShort(iso, opts);
  },
  dateTimeShort(iso: string, opts?: DateFormatOptions): string {
    const date = parseIsoDate(iso);
    if (!date) return FALLBACK_LABEL;
    const locale = resolveLocale(opts?.locale);
    const { day, month } = formatDateParts(date, locale, opts?.timeZone, false);
    const { hour, minute } = formatTimeParts(date, locale, opts?.timeZone);
    return `${day}.${month} ${hour}:${minute}`;
  },
  dateTimeLong(iso: string, opts?: DateFormatOptions): string {
    const date = parseIsoDate(iso);
    if (!date) return FALLBACK_LABEL;
    const locale = resolveLocale(opts?.locale);
    const { day, month, year } = formatDateParts(date, locale, opts?.timeZone, true);
    const { hour, minute } = formatTimeParts(date, locale, opts?.timeZone);
    return `${day}.${month}.${year} ${hour}:${minute}`;
  },
  timeShort(iso: string, opts?: DateFormatOptions): string {
    const date = parseIsoDate(iso);
    if (!date) return FALLBACK_LABEL;
    const locale = resolveLocale(opts?.locale);
    const { hour, minute } = formatTimeParts(date, locale, opts?.timeZone);
    return `${hour}:${minute}`;
  },
  dateShort(iso: string, opts?: DateFormatOptions): string {
    const date = parseIsoDate(iso);
    if (!date) return FALLBACK_LABEL;
    const locale = resolveLocale(opts?.locale);
    const { day, month } = formatDateParts(date, locale, opts?.timeZone, false);
    return `${day}.${month}`;
  },
  ratingLabel(rating: number, count: number): string {
    if (count <= 0) return UI_TEXT.publicProfile.hero.novice;
    return `⭐ ${rating.toFixed(1)} (${count})`;
  },
  starsLabel(rating: number): string {
    const rounded = Math.max(0, Math.min(5, Math.round(rating)));
    return "*".repeat(rounded) + "-".repeat(5 - rounded);
  },
  /**
   * Format a sum line as «Итого: X XXX ₽».
   * @param sumKopeks — sum in **kopeks** (DB convention).
   */
  totalLabel(sumKopeks: number): string {
    if (!Number.isFinite(sumKopeks) || sumKopeks <= 0) {
      return `Итого: 0 ₽`;
    }
    return `Итого: ${new Intl.NumberFormat("ru-RU").format(Math.round(sumKopeks / 100))} ₽`;
  },
  durationLabel(minutes: number): string {
    if (minutes <= 0) return "0 мин";
    if (minutes % 60 === 0) return `${minutes / 60} ч`;
    return `${minutes} мин`;
  },
  /**
   * Format price as «X XXX ₽».
   * @param priceKopeks — value in **kopeks** (DB convention — `Service.price`,
   *   `BookingServiceItem.priceSnapshot`, `BillingPlan.priceKopeks`, …).
   *   Marketing pages that hard-code ruble literals must multiply by 100
   *   before passing, OR keep their own inline formatter.
   */
  priceLabel(priceKopeks: number): string {
    if (!Number.isFinite(priceKopeks) || priceKopeks <= 0) return "0 ₽";
    return `${new Intl.NumberFormat("ru-RU").format(Math.round(priceKopeks / 100))} ₽`;
  },
  /**
   * Format «X XXX ₽ • N мин».
   * @param priceKopeks — value in **kopeks** (see `priceLabel`).
   * @param minutes — duration in minutes (raw).
   */
  priceDurationLabel(priceKopeks: number, minutes: number): string {
    return `${UI_FMT.priceLabel(priceKopeks)} • ${UI_FMT.durationLabel(minutes)}`;
  },
} as const;
