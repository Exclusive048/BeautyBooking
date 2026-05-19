/** Russian "N дней назад" pluralisation. Returns "Сегодня" for 0,
 *  "Вчера" for 1, otherwise N days ago in the correct case. */
export function formatDaysAgo(days: number | null): string {
  if (days === null) return "—";
  if (days === 0) return "Сегодня";
  if (days === 1) return "Вчера";
  const mod10 = days % 10;
  const mod100 = days % 100;
  const suffix =
    mod10 === 1 && mod100 !== 11
      ? "день"
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? "дня"
        : "дней";
  return `${days} ${suffix} назад`;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : "";
  return (first + last).toUpperCase() || "•";
}
