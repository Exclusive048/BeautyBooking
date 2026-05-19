import { AccountType, type UserProfile } from "@prisma/client";
import { prisma } from "./prisma";
import { SEED_EMAIL_DOMAIN } from "./markers";

/**
 * SEED-CONSOLIDATION-A — robust phone-first upsert for showcase /
 * generic seed users.
 *
 * **Why this exists.** The previous `prisma.userProfile.upsert({ where:
 * { email } })` pattern in `seed-showcase-master.ts` produced P2002 on
 * the `phone` unique constraint whenever the canonical phone changed
 * between seed runs (or the canonical email/publicUsername was claimed
 * by a stale row from an earlier generation). Symptoms: rerunning
 * `seed:test` without a reset blew up with
 * `Unique constraint failed on the fields: ('phone')`.
 *
 * **Strategy.** Phone is the natural login key in this OTP-based app.
 * Make phone the upsert key and proactively release any *other* row
 * that's currently squatting on the canonical email or publicUsername
 * by renaming those unique fields to a per-row placeholder. After the
 * release, the upsert by phone is unambiguous.
 *
 * **Idempotency guarantee.** Running the same showcase seed twice in a
 * row (with or without reset) is safe:
 *   1. First run — no shadow rows; upsert path: CREATE.
 *   2. Second run — row exists with canonical phone; shadow query
 *      returns empty; upsert path: UPDATE (refreshes name/roles/etc.).
 *   3. Run after a schema/identifier change — old row holds a stale
 *      email or publicUsername; that row gets its unique field
 *      released; upsert by phone proceeds without P2002.
 */

export type EnsureUserInput = {
  /** Canonical phone — the natural OTP-login key. Must be globally unique
   *  across all seed users (showcase + generic). */
  phone: string;
  /** Canonical email — also unique. Should use the `seedEmail(...)`
   *  helper so reset.ts can identify the row by domain. */
  email: string;
  /** Canonical publicUsername — unique, nullable. Pass `null` for users
   *  that don't need a public profile (e.g. admin). */
  publicUsername?: string | null;
  firstName: string;
  lastName: string;
  displayName: string;
  roles: AccountType[];
};

function releasedEmailFor(rowId: string): string {
  return `released-${rowId}@${SEED_EMAIL_DOMAIN}`;
}

export async function ensureUserByPhone(input: EnsureUserInput): Promise<UserProfile> {
  const { phone, email, publicUsername } = input;
  const desiredPublicUsername = publicUsername ?? null;

  // Phase 1 — release any *other* row that's currently holding our
  // canonical email or publicUsername. We only touch rows whose phone
  // does NOT match ours (so the canonical row, if it already exists, is
  // skipped). Released rows keep their bookings/cards intact — we only
  // rename unique fields to placeholders so we don't collide on update.
  const shadowFilters: Array<{ email?: string; publicUsername?: string }> = [{ email }];
  if (desiredPublicUsername) {
    shadowFilters.push({ publicUsername: desiredPublicUsername });
  }
  const shadows = await prisma.userProfile.findMany({
    where: {
      AND: [{ phone: { not: phone } }, { OR: shadowFilters }],
    },
    select: { id: true, email: true, publicUsername: true },
  });
  for (const shadow of shadows) {
    const data: { email?: string; publicUsername?: string | null } = {};
    if (shadow.email === email) data.email = releasedEmailFor(shadow.id);
    if (desiredPublicUsername && shadow.publicUsername === desiredPublicUsername) {
      data.publicUsername = null;
    }
    if (Object.keys(data).length > 0) {
      await prisma.userProfile.update({ where: { id: shadow.id }, data });
    }
  }

  // Phase 2 — upsert by phone. The release step above guarantees that
  // the canonical email + publicUsername are now free for either the
  // create or update branch.
  return prisma.userProfile.upsert({
    where: { phone },
    update: {
      email,
      publicUsername: desiredPublicUsername,
      firstName: input.firstName,
      lastName: input.lastName,
      displayName: input.displayName,
      roles: input.roles,
    },
    create: {
      phone,
      email,
      publicUsername: desiredPublicUsername,
      firstName: input.firstName,
      lastName: input.lastName,
      displayName: input.displayName,
      roles: input.roles,
    },
  });
}
