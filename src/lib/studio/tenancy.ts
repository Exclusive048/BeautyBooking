import { ProviderType } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";

/**
 * SECURITY-EXPOSURE-AUDIT-01 finding #1 — the single source of truth for
 * "does this entity belong to the studio the caller is authorized for?".
 *
 * The cross-tenant write cluster (block a foreign master's calendar, seize a
 * solo master's booking, rewrite another provider's service config) all came
 * from this check being re-implemented per route — or omitted — and drifting.
 * The exact bugs were:
 *   - NO check: a caller-supplied `masterId` fed straight into a write.
 *   - NULL-PERMISSIVE: `if (entity.studioId && entity.studioId !== studioId)` —
 *     a solo entity (`studioId === null`) passed and was writable from any studio.
 * Every studio-cabinet write that acts on a caller-supplied master/service/
 * booking id MUST go through here instead.
 *
 * **Two id systems (the trap that makes this easy to get wrong):**
 *   - `Provider.studioId` (a master's studio membership, relation "StudioMasters")
 *     references the studio's **Provider.id**.
 *   - `Booking.studioId` / `Service.studioId` / `TimeBlock.studioId` reference
 *     the **Studio.id**.
 * Callers pass the `Studio.id` they authorized via `ensureStudioRole`; this
 * helper resolves the mapping so no call site has to.
 */

export type StudioScopedEntityKind = "master" | "service" | "booking";

async function resolveStudioProviderId(studioId: string): Promise<string> {
  const studio = await prisma.studio.findUnique({
    where: { id: studioId },
    select: { providerId: true },
  });
  if (!studio) {
    throw new AppError("Studio not found", 404, "STUDIO_NOT_FOUND");
  }
  return studio.providerId;
}

/**
 * Assert `entityId` belongs to the studio the caller is authorized for
 * (`studioId` = the `Studio.id` passed to `ensureStudioRole`). Throws a 404
 * "not yours" AppError otherwise — the project's convention for an id the caller
 * has no rights to (mirrors `getStudioMasterDetails`, `deleteStudioService`).
 *
 * The check is done at the query layer (`findFirst` with the studio constraint
 * in the WHERE), so a foreign or solo (`studioId === null`) entity is simply not
 * found — it can never be fetched and acted on. Returns the entity id for
 * convenience.
 */
export async function assertBelongsToStudio(
  kind: StudioScopedEntityKind,
  entityId: string,
  studioId: string
): Promise<string> {
  switch (kind) {
    case "master": {
      const studioProviderId = await resolveStudioProviderId(studioId);
      const master = await prisma.provider.findFirst({
        where: { id: entityId, type: ProviderType.MASTER, studioId: studioProviderId },
        select: { id: true },
      });
      if (!master) {
        throw new AppError("Master not found", 404, "MASTER_NOT_FOUND");
      }
      return master.id;
    }
    case "service": {
      const service = await prisma.service.findFirst({
        where: { id: entityId, studioId },
        select: { id: true },
      });
      if (!service) {
        throw new AppError("Service not found", 404, "SERVICE_NOT_FOUND");
      }
      return service.id;
    }
    case "booking": {
      const booking = await prisma.booking.findFirst({
        where: { id: entityId, studioId },
        select: { id: true },
      });
      if (!booking) {
        throw new AppError("Booking not found", 404, "BOOKING_NOT_FOUND");
      }
      return booking.id;
    }
  }
}
