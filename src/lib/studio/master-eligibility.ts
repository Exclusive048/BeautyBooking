import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";

/**
 * STUDIO-BUGS-FIX-A bug #5: an INVITED master (Provider row that exists in
 * the studio but the invitee hasn't claimed it yet — `ownerUserId IS NULL`)
 * must NOT be assignable to services, bookable, or counted as a working
 * column in the schedule grid. Only ACTIVE masters (claimed + published)
 * are eligible.
 *
 * The `ownerUserId IS NOT NULL` check is the canonical "invite accepted"
 * predicate — the StudioInvite acceptance flow sets `Provider.ownerUserId`
 * to the invitee's user id. `isPublished` then governs Pause/Activate
 * (DISABLED state).
 */

export type StudioMasterEligibility = {
  ownerUserId: string | null;
  isPublished: boolean;
};

export function isStudioMasterActive(
  master: StudioMasterEligibility,
): boolean {
  return master.ownerUserId !== null && master.isPublished;
}

/**
 * Fetches a master Provider scoped to a studio and asserts it is ACTIVE
 * (invite accepted + published). Throws structured errors usable by API
 * routes:
 *   - 404 `MASTER_NOT_FOUND` if the provider doesn't belong to the studio
 *   - 409 `MASTER_NOT_ACTIVE` if the master is INVITED (not yet accepted)
 *     or DISABLED (paused)
 */
export async function requireActiveStudioMaster(input: {
  studioProviderId: string;
  masterId: string;
}): Promise<{ id: string; ownerUserId: string | null; isPublished: boolean }> {
  const master = await prisma.provider.findFirst({
    where: {
      id: input.masterId,
      type: "MASTER",
      studioId: input.studioProviderId,
    },
    select: { id: true, ownerUserId: true, isPublished: true },
  });
  if (!master) {
    throw new AppError("Master not found", 404, "MASTER_NOT_FOUND");
  }
  if (!isStudioMasterActive(master)) {
    throw new AppError(
      "Мастер ещё не принял приглашение или приостановлен.",
      409,
      "MASTER_NOT_ACTIVE",
    );
  }
  return master;
}
