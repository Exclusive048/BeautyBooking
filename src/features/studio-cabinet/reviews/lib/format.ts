/** Russian relative-date label for a Review timestamp. */
export function formatReviewDateLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const diffMs = now.getTime() - date.getTime();
  const day = 24 * 60 * 60 * 1000;
  const days = Math.floor(diffMs / day);
  if (days <= 0) return "сегодня";
  if (days === 1) return "вчера";
  if (days < 7) {
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
  if (days < 14) return "неделю назад";
  if (days < 30) return `${Math.floor(days / 7)} недели назад`;
  if (days < 60) return "месяц назад";
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} мес. назад`;
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : "";
  return (first + last).toUpperCase() || "•";
}
