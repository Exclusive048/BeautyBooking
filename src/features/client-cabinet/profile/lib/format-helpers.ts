import { pluralize } from "@/lib/utils/pluralize";

// Genitive month names — the case required after the preposition «с»
// ("с июня 2026"). `Intl.DateTimeFormat(month:"long")` without a day yields the
// NOMINATIVE form ("июнь") for ru-RU, which reads wrong after «с» (EXP-003).
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

export function formatVisitsLabel(n: number): string {
  return `${n} ${pluralize(n, "визит", "визита", "визитов")}`;
}

export function formatMemberSince(iso: string): string {
  // FIX-EXP-CONTENT-GRAMMAR (EXP-003): rendered as «С нами с {…}», so the month
  // must be genitive ("июня"), not the Intl nominative ("июнь").
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const month = MONTHS_GENITIVE[d.getMonth()] ?? "";
    return `${month} ${d.getFullYear()}`;
  } catch {
    return iso;
  }
}

export function formatConnectedAt(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function displayBirthday(iso: string | null, hideYear: boolean): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const dayMonth = `${d} ${MONTHS_GENITIVE[m - 1]}`;
  return hideYear ? dayMonth : `${dayMonth} ${y}`;
}
