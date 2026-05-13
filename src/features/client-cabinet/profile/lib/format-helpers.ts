import { pluralize } from "@/lib/utils/pluralize";

export function formatVisitsLabel(n: number): string {
  return `${n} ${pluralize(n, "визит", "визита", "визитов")}`;
}

export function formatMemberSince(iso: string): string {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("ru-RU", {
      month: "long",
      year: "numeric",
    }).format(d);
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
  const months = [
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
  ];
  const dayMonth = `${d} ${months[m - 1]}`;
  return hideYear ? dayMonth : `${dayMonth} ${y}`;
}
