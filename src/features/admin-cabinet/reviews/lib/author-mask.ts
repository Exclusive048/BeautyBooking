import { UI_TEXT } from "@/lib/ui/text";

/**
 * Masks a user's display name to "<First name> <First-letter-of-last-name>." —
 * "Алексей Иванов" → "Алексей И.". Single-word names pass through
 * unchanged. Empty / missing names fall back to «Удалённый аккаунт»
 * (currently never triggers because `Review.author` is required, but
 * defensive).
 *
 * Same rationale as the dashboard live feed (`maskLastName`) — admin
 * needs to *recognise* who wrote the review without exposing full
 * PII on screen.
 */
export function maskAuthorDisplay(name: string | null | undefined): string {
  if (!name) return UI_TEXT.adminPanel.reviews.card.authorDeleted;
  const trimmed = name.trim();
  if (!trimmed) return UI_TEXT.adminPanel.reviews.card.authorDeleted;
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return UI_TEXT.adminPanel.reviews.card.authorDeleted;
  if (parts.length === 1) return parts[0]!;
  const first = parts[0]!;
  const last = parts[parts.length - 1]!;
  return `${first} ${last.charAt(0).toUpperCase()}.`;
}
