/**
 * PII masking helpers for log payloads. Use these whenever a phone or email
 * may appear in `logInfo`/`logError`/`logWarn` calls — both for the 152-ФЗ
 * stance (production logs minimise PII exposure) and operational hygiene
 * (logs are often shared / forwarded to monitoring providers).
 *
 * Two file-local copies of similar logic existed before this module
 * (`src/lib/bookings/link-guest-bookings.ts` `maskPhone`, `src/lib/support/smtp.ts`
 * `maskEmailAddress`) — they continue to work as-is. New call sites should
 * prefer these shared exports.
 */

/**
 * Mask a phone number, keeping the country prefix + last 2 digits, e.g.
 * `+79001234567` → `+7****67`. Returns the original input verbatim if it's
 * shorter than 4 characters or doesn't start with `+`.
 */
export function maskPhone(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.length < 4 || !trimmed.startsWith("+")) return trimmed;
  const last = trimmed.slice(-2);
  return `${trimmed.slice(0, 2)}****${last}`;
}

/**
 * Mask an email address, keeping the first 2 chars of the local part + the
 * domain intact, e.g. `john.doe@example.com` → `jo******@example.com`.
 * Returns `***` for malformed input (no `@` or empty local part).
 */
export function maskEmail(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.indexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return "***";
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const visible = local.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(0, local.length - 2))}@${domain}`;
}
