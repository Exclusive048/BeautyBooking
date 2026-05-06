/**
 * Russian plural form for "отзыв" / "отзыва" / "отзывов" matched to a count.
 * Mirrors the shape of `pluralize-days.ts` so callers stay consistent.
 */
export function pluralizeReviews(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "отзыв";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "отзыва";
  return "отзывов";
}

/** "12 отзывов" — count + plural form. */
export function formatReviews(n: number): string {
  return `${n} ${pluralizeReviews(n)}`;
}
