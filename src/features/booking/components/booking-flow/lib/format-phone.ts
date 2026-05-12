/**
 * RU phone input mask: produces the canonical `+7 (XXX) XXX-XX-XX`
 * shape while the user types, regardless of paste/typing source.
 *
 * Strategy:
 *   1. Strip everything except digits.
 *   2. If the leading digit is 8 → coerce to 7 (RU local prefix
 *      convention).
 *   3. If user pasted a number that didn't start with 7 → prepend 7.
 *   4. Slice to 11 digits max.
 *   5. Render the mask progressively (partial strings keep the
 *      cursor experience natural).
 *
 * Returns both the masked label (for `<input>` value) and the
 * digits-only canonical form (for submit / normalisation).
 */
export type FormattedPhone = {
  /** UI mask, e.g. "+7 (916) 234-56-78" or partial "+7 (916) 234". */
  display: string;
  /** Digits only, leading 7. Empty until ≥1 digit typed. */
  digits: string;
  /** True once we have a full 11-digit RU number. */
  isComplete: boolean;
};

const RU_COUNTRY_CODE = "7";

export function formatRussianPhone(raw: string): FormattedPhone {
  const rawDigits = raw.replace(/\D/g, "");
  if (rawDigits.length === 0) {
    return { display: "", digits: "", isComplete: false };
  }

  let body = rawDigits;
  // Coerce common local prefixes to canonical +7.
  if (body.startsWith("8")) body = `${RU_COUNTRY_CODE}${body.slice(1)}`;
  if (!body.startsWith(RU_COUNTRY_CODE)) body = `${RU_COUNTRY_CODE}${body}`;
  body = body.slice(0, 11);

  const part1 = body.slice(1, 4); // (XXX)
  const part2 = body.slice(4, 7); // XXX
  const part3 = body.slice(7, 9); // XX
  const part4 = body.slice(9, 11); // XX

  let display = "+7";
  if (body.length >= 1) display = "+7";
  if (part1) display += ` (${part1}`;
  if (part1.length === 3) display += ")";
  if (part2) display += ` ${part2}`;
  if (part3) display += `-${part3}`;
  if (part4) display += `-${part4}`;

  return {
    display,
    digits: body,
    isComplete: body.length === 11,
  };
}

/** Normalised E.164 form for submission. */
export function toCanonicalPhone(digits: string): string {
  if (!digits) return "";
  return `+${digits}`;
}

/** "+7 (916) 234-56-78" → "+7 ••• ••• 56 78" for the success card. */
export function maskRussianPhone(displayOrDigits: string): string {
  const digits = displayOrDigits.replace(/\D/g, "");
  if (digits.length < 4) return displayOrDigits;
  const suffix = digits.slice(-4);
  return `+7 ••• ••• ${suffix.slice(0, 2)} ${suffix.slice(2)}`;
}
