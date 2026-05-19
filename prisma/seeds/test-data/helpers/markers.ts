// Identifying markers for seed-only records. Keep these in sync with reset.ts —
// the reset utility relies on these exact prefixes to scope its delete-many.
export const SEED_EMAIL_DOMAIN = "test.masterryadom.local";
export const SEED_PHONE_PREFIX = "+7900000";

/**
 * SEED-CONSOLIDATION-A — showcase phone schema (+CLIENT-SHOWCASE-SEED-A).
 *
 * Five showcase accounts use fixed, memorable phones outside the
 * generic seed range so they're trivially demoable:
 *
 *   +7 999 100 00 00  — solo master (Анна Соколова)
 *   +7 999 200 00 00  — studio owner (Виктория Алмазова, Vision)
 *   +7 999 300 00 00  — master inside a studio (Марина, member of Vision)
 *   +7 999 400 00 00  — admin
 *   +7 999 500 00 00  — active client (Елена Петрова) — unlocks client cabinet QA
 *
 * The team in the studio showcase ALSO uses the +79992xxxxxx prefix
 * (one per master ordinal). All five buckets are caught by
 * `SHOWCASE_PHONE_PREFIXES` so reset.ts can wipe them even if the email
 * marker drifts.
 */
export const SHOWCASE_PHONE_MASTER = "+79991000000";
export const SHOWCASE_PHONE_STUDIO_OWNER = "+79992000000";
export const SHOWCASE_PHONE_STUDIO_MASTER = "+79993000000";
export const SHOWCASE_PHONE_ADMIN = "+79994000000";
export const SHOWCASE_PHONE_CLIENT = "+79995000000";

export const SHOWCASE_PHONE_PREFIXES = ["+79991", "+79992", "+79993", "+79994", "+79995"] as const;

export function isSeedUser(input: { email?: string | null; phone?: string | null }): boolean {
  if (input.email && input.email.endsWith(`@${SEED_EMAIL_DOMAIN}`)) return true;
  if (input.phone && input.phone.startsWith(SEED_PHONE_PREFIX)) return true;
  if (input.phone && SHOWCASE_PHONE_PREFIXES.some((p) => input.phone!.startsWith(p))) return true;
  return false;
}

export function seedEmail(role: "master" | "studio" | "client" | "admin", slug: string): string {
  return `seed-${role}-${slug}@${SEED_EMAIL_DOMAIN}`;
}

/**
 * Sequential test phone in the +7900000XXXX range (4-digit suffix). The seed
 * uses ordinals 0001..0099 for masters, 0100..0149 for clients, 0150..0199
 * for studio owners. Don't reuse — collisions break upsert idempotency.
 */
export function seedPhone(ordinal: number): string {
  if (ordinal < 1 || ordinal > 9999) {
    throw new Error(`seedPhone ordinal out of range: ${ordinal}`);
  }
  return `${SEED_PHONE_PREFIX}${String(ordinal).padStart(4, "0")}`;
}
