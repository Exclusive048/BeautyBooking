import { StudioRole } from "@prisma/client";
import { z } from "zod";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { createMasterPackageSchema } from "@/lib/master/schemas";
import { createMasterPackage } from "@/lib/master/services-mutations";
import { prisma } from "@/lib/prisma";
import { ensureStudioRole } from "@/lib/studio/access";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * STUDIO-PACKAGES-A: thin wrapper around the existing master package
 * mutation. `ServicePackage.masterId` is a generic Provider FK — we
 * pass the studio's own `providerId` so the package belongs to the
 * studio's Provider record. Mirrors master semantics 1:1 (price logic,
 * service ownership check via `service.providerId === masterId`).
 */
const bodySchema = createMasterPackageSchema.extend({
  studioId: z.string().trim().min(1),
});

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const body = await parseBody(req, bodySchema);
    await ensureStudioRole({
      studioId: body.studioId,
      userId: user.id,
      allowed: [StudioRole.OWNER, StudioRole.ADMIN],
    });

    const studio = await prisma.studio.findUnique({
      where: { id: body.studioId },
      select: { providerId: true },
    });
    if (!studio) return jsonFail(404, "Studio not found", "STUDIO_NOT_FOUND");

    const data = await createMasterPackage(studio.providerId, {
      name: body.name,
      serviceIds: body.serviceIds,
      discountType: body.discountType,
      discountValue: body.discountValue,
      isEnabled: body.isEnabled,
    });
    return jsonOk(data, { status: 201 });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/studio/service-packages failed", {
        requestId: getRequestId(req),
        route: "POST /api/studio/service-packages",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
