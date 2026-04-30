/**
 * Russian plural form for "день" / "дня" / "дней" matched to a count.
 * Examples:
 *   pluralizeDays(1)  → "день"
 *   pluralizeDays(2)  → "дня"
 *   pluralizeDays(5)  → "дней"
 *   pluralizeDays(11) → "дней"  (special case)
 *   pluralizeDays(21) → "день"
 */
export function pluralizeDays(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "день";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "дня";
  return "дней";
}

/** "5 дней" — count + plural form. */
export function formatDays(n: number): string {
  return `${n} ${pluralizeDays(n)}`;
}
