import type { Prisma } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";

/**
 * STUDIO-BUGS-FIX-A bug #5: an INVITED master (Provider row that exists in
 * the studio but the invitee hasn't claimed it yet — `ownerUserId IS NULL`)
 * must NOT be assignable to services, bookable, or counted as a working
 * column in the schedule grid. Only ACTIVE masters (claimed + not paused)
 * are eligible.
 *
 * The `ownerUserId IS NOT NULL` check is the canonical "invite accepted"
 * predicate — the StudioInvite acceptance flow sets `Provider.ownerUserId`
 * to the invitee's user id. `studioPaused` then governs Pause/Activate
 * (DISABLED state).
 *
 * STUDIO-PAUSE-SPLIT-01 (2026-09-23): пауза жила в `isPublished` — том же
 * флаге, что личная видимость мастера, поэтому пауза в студии гасила и его
 * личную страницу. Теперь пауза — `studioPaused`, а `isPublished` к активности
 * в студии отношения не имеет.
 */

export type StudioMasterEligibility = {
  ownerUserId: string | null;
  studioPaused: boolean;
};

export function isStudioMasterActive(
  master: StudioMasterEligibility,
): boolean {
  return master.ownerUserId !== null && !master.studioPaused;
}

/**
 * Prisma `where` fragment — the query equivalent of {@link isStudioMasterActive}
 * (invite accepted → `ownerUserId` set, and not paused in the studio). Canonical
 * "ACTIVE master" filter for counting seats against the team cap (BC-CAP). Spread
 * alongside `{ type: "MASTER", studioId }` in a `provider.count`/`findMany`.
 */
export const STUDIO_ACTIVE_MASTER_WHERE = {
  ownerUserId: { not: null },
  studioPaused: false,
} satisfies Prisma.ProviderWhereInput;

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
}): Promise<{
  id: string;
  ownerUserId: string | null;
  studioPaused: boolean;
  // FIX-R2-04-B: the master provider's own timezone — the salon-local
  // tz in which the work-hours window (and the engine's slot-gen) is
  // interpreted. Surfaced here so the studio create/move paths read the
  // booking instant in the salon tz without an extra query.
  timezone: string;
}> {
  const master = await prisma.provider.findFirst({
    where: {
      id: input.masterId,
      type: "MASTER",
      studioId: input.studioProviderId,
    },
    select: { id: true, ownerUserId: true, studioPaused: true, timezone: true },
  });
  if (!master) {
    throw new AppError("Мастер не найден.", 404, "MASTER_NOT_FOUND");
  }
  if (!isStudioMasterActive(master)) {
    throw new AppError(
      "Мастер ещё не принял приглашение или пока не работает.",
      409,
      "MASTER_NOT_ACTIVE",
    );
  }
  return master;
}
