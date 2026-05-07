/**
 * Display-only formatters used across the 27a CRM page. Server-stable,
 * no Date.now() side-effects: callers pass `now` when consistency between
 * server render and client hydration matters.
 */

const RUBLE_FMT = new Intl.NumberFormat("ru-RU");
const RU_PLURAL = new Intl.PluralRules("ru-RU");

export function formatRubles(kopeks: number): string {
  if (!Number.isFinite(kopeks) || kopeks <= 0) return "—";
  return `${RUBLE_FMT.format(Math.round(kopeks / 100))} ₽`;
}

export function formatNumberShort(kopeks: number): string {
  if (!Number.isFinite(kopeks) || kopeks <= 0) return "—";
  return RUBLE_FMT.format(Math.round(kopeks / 100));
}

export function pluralize(n: number, one: string, few: string, many: string): string {
  const form = RU_PLURAL.select(n);
  if (form === "one") return one;
  if (form === "few") return few;
  return many;
}

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

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * "сегодня", "вчера", "2 мая", "21 апреля 2025". Used both in list rows
 * (last visit) and in detail meta ("с 2 мая").
 */
export function formatRelativeDate(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "—";
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return "—";
  const targetMid = startOfDay(target);
  const todayMid = startOfDay(now);
  const diffDays = Math.round((todayMid.getTime() - targetMid.getTime()) / DAY_MS);
  if (diffDays === 0) return "сегодня";
  if (diffDays === 1) return "вчера";
  const month = MONTH_GENITIVE[target.getMonth()] ?? "";
  if (target.getFullYear() !== now.getFullYear()) {
    return `${target.getDate()} ${month} ${target.getFullYear()}`;
  }
  return `${target.getDate()} ${month}`;
}

export function formatShortDate(iso: string | null): string {
  if (!iso) return "—";
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return "—";
  const day = String(target.getDate()).padStart(2, "0");
  const month = String(target.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}`;
}

/**
 * Cosmetic phone formatter for Russian / Kazakhstan numbers. Falls back
 * to the raw string when it doesn't look like an 11-digit E.164 — we
 * never lie about a number we couldn't parse.
 */
export function formatPhone(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D+/g, "");
  if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) {
    const country = digits.startsWith("8") ? "7" : digits.slice(0, 1);
    const a = digits.slice(1, 4);
    const b = digits.slice(4, 7);
    const c = digits.slice(7, 9);
    const d = digits.slice(9, 11);
    return `+${country} ${a} ${b} ${c} ${d}`;
  }
  return trimmed;
}

const AVATAR_PALETTE = [
  "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  "bg-slate-100 text-slate-700 dark:bg-slate-800/40 dark:text-slate-300",
] as const;

function djb2(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function pickAvatarColor(seed: string): string {
  return AVATAR_PALETTE[djb2(seed) % AVATAR_PALETTE.length] ?? AVATAR_PALETTE[0];
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}
