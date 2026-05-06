// Identifying markers for seed-only records. Keep these in sync with reset.ts —
// the reset utility relies on these exact prefixes to scope its delete-many.
export const SEED_EMAIL_DOMAIN = "test.masterryadom.local";
export const SEED_PHONE_PREFIX = "+7900000";

export function isSeedUser(input: { email?: string | null; phone?: string | null }): boolean {
  if (input.email && input.email.endsWith(`@${SEED_EMAIL_DOMAIN}`)) return true;
  if (input.phone && input.phone.startsWith(SEED_PHONE_PREFIX)) return true;
  return false;
}

export function seedEmail(role: "master" | "studio" | "client", slug: string): string {
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
