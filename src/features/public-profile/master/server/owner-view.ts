import { cache } from "react";
import { getViewer } from "@/features/public-profile/master/server/viewer";
import { prisma } from "@/lib/prisma";

/**
 * FIX-MASTER-01 item 5 — is the current viewer the owner of this public
 * profile? The booking widget must not be OFFERED to the owner (the
 * server-side self-booking guard in booking-core.ts stays as defense in
 * depth — this only removes the dead-end affordance that used to answer
 * with «Cannot book your own services» after the attempt).
 *
 * Direct Prisma lookup on purpose: the public `/api/providers/{id}` DTO
 * deliberately omits `ownerUserId` (invariant #29 — internal ids never
 * leave public APIs), so ownership can only be resolved server-side.
 * `cache()` dedupes within the request like the sibling `getProvider`.
 */
export const isViewerProfileOwner = cache(async (providerId: string): Promise<boolean> => {
  const user = await getViewer();
  if (!user) return false;
  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { ownerUserId: true },
  });
  return provider?.ownerUserId === user.id;
});
