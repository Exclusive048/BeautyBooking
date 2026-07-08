import { AccountType, Prisma, type UserProfile } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureClientRoleForUser } from "@/lib/auth/roles";

// OTP-EMAIL-LOGIN-RACE: local P2002 constant, mirroring the other
// re-read-on-conflict sites (`detect-city.ts`, `conversation-slug.ts`).
const PRISMA_UNIQUE_VIOLATION = "P2002";

/**
 * Resolve the {@link UserProfile} for an email-OTP login.
 *
 * Three cases, all landing on the same row a single request would:
 *  - **returning user** (`existing` non-null) → ensure the CLIENT role is present;
 *  - **first-time user** → create a fresh `[CLIENT]` profile;
 *  - **race loser** → two near-simultaneous first-time logins for the same new
 *    email both pass the caller's `findUnique` (both see no row), then both
 *    `create`; the loser hits **P2002** on `UserProfile.email @unique`. Catch it,
 *    re-read the winner's row and continue idempotently (ensuring CLIENT role).
 *
 * This is the 6th re-read-on-conflict P2002 site; it mirrors the recovery in
 * `src/lib/cities/detect-city.ts` and `src/lib/chat/conversation-slug.ts`
 * exactly (catch P2002 → re-read → continue; rethrow anything else).
 *
 * `existing` is passed in (not re-fetched here) so the caller keeps its
 * parallel `Promise.all` lookup — the normal (non-racing) path is unchanged:
 * a fresh create returns directly without an extra role round-trip.
 */
export async function resolveEmailLoginProfile(
  normalizedEmail: string,
  existing: UserProfile | null,
): Promise<UserProfile> {
  if (existing) {
    return withClientRole(existing);
  }

  try {
    return await prisma.userProfile.create({
      data: { email: normalizedEmail, roles: [AccountType.CLIENT] },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === PRISMA_UNIQUE_VIOLATION
    ) {
      // Race: the parallel request just created this profile. Re-read it.
      const recovered = await prisma.userProfile.findUnique({
        where: { email: normalizedEmail },
      });
      if (recovered) {
        return withClientRole(recovered);
      }
    }
    throw error;
  }
}

/**
 * Ensure the profile carries the CLIENT role. `ensureClientRoleForUser`
 * returns the same array reference when CLIENT is already present, so this is
 * a no-op (no write) for a row that already has it.
 */
async function withClientRole(profile: UserProfile): Promise<UserProfile> {
  const nextRoles = await ensureClientRoleForUser(profile.id, profile.roles);
  return nextRoles === profile.roles ? profile : { ...profile, roles: nextRoles };
}
