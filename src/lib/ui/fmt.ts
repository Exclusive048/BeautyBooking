import * as UI_TEXT from "@/lib/ui/text";

/**
 * 29.09 доработки · 24 (UI-20) — единственное место форматирования дат, чисел
 * и денег для интерфейса. `Intl.*` / `toLocale*` / литерал «₽» вне этого модуля
 * и пары базовых соседей держит сторож `format-sites-inventory.test.ts`.
 *
 * **Пояс — обязательный аргумент каждого формата даты** (rule 17): либо пояс
 * сущности/кабинета (salon-tz, UTC-tech), либо явный {@link VIEWER_TZ} — часы
 * зрителя. Забыть выбор нельзя: без `timeZone` вызов не компилируется. Так
 * класс LOGIC-25 (дата на сервере по часам контейнера) не прячется внутри
 * общего хелпера — серверный `VIEWER_TZ` ловит сторож
 * `billing/deadline-label.test.ts`.
 */

/** Часы зрителя (viewer-tz). Только клиентские поверхности: на сервере это `TZ` контейнера. */
export const VIEWER_TZ: unique symbol = Symbol("viewer-tz");

/** IANA-пояс либо {@link VIEWER_TZ}. */
export type DisplayTimeZone = string | typeof VIEWER_TZ;

type DateFormatOptions = { locale?: string; timeZone: DisplayTimeZone };

const DEFAULT_LOCALE = "ru-RU";
const FALLBACK_LABEL = "—";
/** Пояс на случай битого значения в данных — как у `schedule/timezone.ts`. */
const FALLBACK_TIME_ZONE = "Europe/Moscow";
/** Неразрывный пробел: число и «₽» / «тыс» не разъезжаются по строкам (решение 24.2). */
const NBSP = " ";

/**
 * Формы даты. Ключ — что видно на экране (примеры — для 29.09.2026, пн, 14:30).
 * Месяц словом — всегда с днём без ведущего нуля («5 окт.», не «05 окт.»).
 */
const DATE_PRESETS = {
  /** «пн» */
  weekdayShort: { weekday: "short" },
  /** «понедельник» */
  weekdayLong: { weekday: "long" },
  /** «29» */
  dayOfMonth: { day: "numeric" },
  /** «сент.» */
  monthShort: { month: "short" },
  /** «29 сент.» */
  dayMonthShort: { day: "numeric", month: "short" },
  /** «29 сентября» */
  dayMonthLong: { day: "numeric", month: "long" },
  /** «29 сент. 2026 г.» */
  dayMonthYearShort: { day: "numeric", month: "short", year: "numeric" },
  /** «29 сентября 2026 г.» */
  dayMonthYearLong: { day: "numeric", month: "long", year: "numeric" },
  /** «сент. 2026 г.» */
  monthYearShort: { month: "short", year: "numeric" },
  /** «сентябрь 2026 г.» */
  monthYearLong: { month: "long", year: "numeric" },
  /** «пн, 29 сент.» */
  weekdayDayMonthShort: { weekday: "short", day: "numeric", month: "short" },
  /** «понедельник, 29 сентября» */
  weekdayDayMonthLong: { weekday: "long", day: "numeric", month: "long" },
  /** «29 сент., 14:30» */
  dayMonthShortTime: { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
  /** «29.09, 14:30» */
  dayMonthNumericTime: { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
} satisfies Record<string, Intl.DateTimeFormatOptions>;

export type DatePreset = keyof typeof DATE_PRESETS;

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function resolveLocale(locale?: string): string {
  const trimmed = locale?.trim();
  return trimmed ? trimmed : DEFAULT_LOCALE;
}

/**
 * Кэшированный `Intl.DateTimeFormat`. Битый пояс из данных деградирует до
 * московского, а не роняет поверхность `RangeError` (как `partsFromDate`).
 */
function dateFormatter(
  locale: string,
  key: string,
  options: Intl.DateTimeFormatOptions,
  timeZone: DisplayTimeZone,
): Intl.DateTimeFormat {
  const zone = timeZone === VIEWER_TZ ? undefined : timeZone;
  const cacheKey = `${locale}|${key}|${zone ?? ""}`;
  const cached = dateFormatters.get(cacheKey);
  if (cached) return cached;
  let formatter: Intl.DateTimeFormat;
  try {
    // tz-ok: пояс выбирает вызывающий — VIEWER_TZ означает часы зрителя.
    formatter = new Intl.DateTimeFormat(locale, zone ? { ...options, timeZone: zone } : options);
  } catch {
    formatter = new Intl.DateTimeFormat(locale, { ...options, timeZone: FALLBACK_TIME_ZONE });
  }
  dateFormatters.set(cacheKey, formatter);
  return formatter;
}

function toDate(value: Date | string | number): Date | null {
  if (typeof value === "string" && !value.trim()) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function partsMap(
  date: Date,
  locale: string,
  key: string,
  options: Intl.DateTimeFormatOptions,
  timeZone: DisplayTimeZone,
): Record<string, string> {
  const parts = dateFormatter(locale, key, options, timeZone).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

const NUMERIC_DAY_MONTH: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit" };
const NUMERIC_DAY_MONTH_YEAR: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" };
const NUMERIC_TIME: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hourCycle: "h23" };

function dayMonth(date: Date, locale: string, timeZone: DisplayTimeZone): string {
  const map = partsMap(date, locale, "numericDayMonth", NUMERIC_DAY_MONTH, timeZone);
  return `${map.day ?? "00"}.${map.month ?? "00"}`;
}

function hourMinute(date: Date, locale: string, timeZone: DisplayTimeZone): string {
  const map = partsMap(date, locale, "numericTime", NUMERIC_TIME, timeZone);
  return `${map.hour ?? "00"}:${map.minute ?? "00"}`;
}

const numberFormatters = new Map<string, Intl.NumberFormat>();

function numberFormatter(fractionDigits?: { min: number; max: number }): Intl.NumberFormat {
  const key = fractionDigits ? `${fractionDigits.min}-${fractionDigits.max}` : "default";
  const cached = numberFormatters.get(key);
  if (cached) return cached;
  const formatter = new Intl.NumberFormat(
    DEFAULT_LOCALE,
    fractionDigits
      ? { minimumFractionDigits: fractionDigits.min, maximumFractionDigits: fractionDigits.max }
      : undefined,
  );
  numberFormatters.set(key, formatter);
  return formatter;
}

const ONE_DECIMAL = { min: 0, max: 1 } as const;

/**
 * «1,2 тыс» / «4,2 млн» (решение 24.1). Значение сначала округляется до
 * десятых своей единицы, поэтому 999 960 — это «1 млн», а не «1 000 тыс».
 */
function shortScale(value: number): { amount: number; unit: string | null } {
  const abs = Math.abs(value);
  const thousands = Math.round(abs / 100) / 10;
  if (thousands >= 1000) {
    return { amount: Math.sign(value) * (Math.round(abs / 100_000) / 10), unit: UI_TEXT.common.millionShort };
  }
  if (abs >= 1000) return { amount: Math.sign(value) * thousands, unit: UI_TEXT.common.thousandShort };
  return { amount: value, unit: null };
}

function rubles(text: string): string {
  return `${text}${NBSP}${UI_TEXT.common.currencyRub}`;
}

export const UI_FMT = {
  notificationTimeLabel(iso: string, opts: DateFormatOptions): string {
    return UI_FMT.dateTimeShort(iso, opts);
  },
  /** «29.09 14:30» */
  dateTimeShort(iso: string, opts: DateFormatOptions): string {
    const date = toDate(iso);
    if (!date) return FALLBACK_LABEL;
    const locale = resolveLocale(opts.locale);
    return `${dayMonth(date, locale, opts.timeZone)} ${hourMinute(date, locale, opts.timeZone)}`;
  },
  /** «29.09.2026 14:30» */
  dateTimeLong(iso: string, opts: DateFormatOptions): string {
    const date = toDate(iso);
    if (!date) return FALLBACK_LABEL;
    const locale = resolveLocale(opts.locale);
    const map = partsMap(date, locale, "numericDayMonthYear", NUMERIC_DAY_MONTH_YEAR, opts.timeZone);
    return `${map.day ?? "00"}.${map.month ?? "00"}.${map.year ?? "0000"} ${hourMinute(date, locale, opts.timeZone)}`;
  },
  /** «14:30» */
  timeShort(value: Date | string, opts: DateFormatOptions): string {
    const date = toDate(value);
    if (!date) return FALLBACK_LABEL;
    return hourMinute(date, resolveLocale(opts.locale), opts.timeZone);
  },
  /** «29.09» */
  dateShort(iso: string, opts: DateFormatOptions): string {
    const date = toDate(iso);
    if (!date) return FALLBACK_LABEL;
    return dayMonth(date, resolveLocale(opts.locale), opts.timeZone);
  },
  /** Дата момента времени словами — форма из {@link DATE_PRESETS}. */
  date(value: Date | string | number, preset: DatePreset, opts: DateFormatOptions): string {
    const date = toDate(value);
    if (!date) return FALLBACK_LABEL;
    return dateFormatter(resolveLocale(opts.locale), preset, DATE_PRESETS[preset], opts.timeZone).format(date);
  },
  /**
   * Дата-ключ `YYYY-MM-DD` (дата салона, а не момент времени) словами —
   * UTC-tech: ключ ставится на UTC-полдень и читается в UTC, поэтому подпись
   * не зависит ни от пояса зрителя, ни от пояса процесса. Непарсимый ключ
   * возвращается как есть.
   */
  dateKey(dateKey: string, preset: DatePreset): string {
    const date = toDate(`${dateKey}T12:00:00.000Z`);
    if (!date) return dateKey;
    return UI_FMT.date(date, preset, { timeZone: "UTC" });
  },
  ratingLabel(rating: number, count: number): string {
    if (count <= 0) return UI_TEXT.common.novice;
    return `⭐ ${rating.toFixed(1)} (${count})`;
  },
  durationLabel(minutes: number): string {
    if (minutes <= 0) return "0 мин";
    if (minutes % 60 === 0) return `${minutes / 60} ч`;
    return `${minutes} мин`;
  },
  /** «1 412» — счётчик с разрядами. */
  count(value: number): string {
    return numberFormatter().format(value);
  },
  /** «99,5» — число с ровно `fractionDigits` знаками после запятой. */
  decimal(value: number, fractionDigits: number): string {
    return numberFormatter({ min: fractionDigits, max: fractionDigits }).format(value);
  },
  /** «1,2 тыс» / «4,2 млн» — крупные счётчики (решение 24.1). */
  countShort(value: number): string {
    const { amount, unit } = shortScale(value);
    if (!unit) return UI_FMT.count(value);
    return `${numberFormatter(ONE_DECIMAL).format(amount)}${NBSP}${unit}`;
  },
  /**
   * «X XXX ₽» — цена в целых рублях.
   * @param priceKopeks — копейки (`Service.price`, `priceSnapshot`, `BillingPlan.priceKopeks`, …).
   * Ноль и отрицательное — «0 ₽» (цена услуги «бесплатно»); где ноль значит
   * «нет данных» (таблицы, KPI, история) — {@link UI_FMT.priceLabelOrDash}.
   */
  priceLabel(priceKopeks: number): string {
    if (!Number.isFinite(priceKopeks) || priceKopeks <= 0) return rubles("0");
    return rubles(numberFormatter().format(Math.round(priceKopeks / 100)));
  },
  /** Как {@link UI_FMT.priceLabel}, но «—» для `null` и ≤0 (решение 24.3). */
  priceLabelOrDash(priceKopeks: number | null | undefined): string {
    if (priceKopeks === null || priceKopeks === undefined || !Number.isFinite(priceKopeks) || priceKopeks <= 0) {
      return FALLBACK_LABEL;
    }
    return UI_FMT.priceLabel(priceKopeks);
  },
  /** «4,2 млн ₽» / «12 тыс ₽» / «950 ₽» — крупные суммы в KPI и на осях (решение 24.1). */
  moneyShort(kopeks: number): string {
    if (!Number.isFinite(kopeks) || kopeks <= 0) return rubles("0");
    const rublesValue = Math.round(kopeks / 100);
    const { unit } = shortScale(rublesValue);
    if (!unit) return UI_FMT.priceLabel(kopeks);
    return rubles(UI_FMT.countShort(rublesValue));
  },
  /** «X XXX ₽ • N мин». */
  priceDurationLabel(priceKopeks: number, minutes: number): string {
    return `${UI_FMT.priceLabel(priceKopeks)} • ${UI_FMT.durationLabel(minutes)}`;
  },
} as const;
