import { z } from "zod";
import { SubscriptionScope, StudioRole } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentPlan } from "@/lib/billing/get-current-plan";
import { ensureClientCardAccess } from "@/lib/crm/guards";
import { getRequestId, logError } from "@/lib/logging/logger";
import { prisma } from "@/lib/prisma";
import { ensureStudioRole } from "@/lib/studio/access";
import { parseQuery } from "@/lib/validation";
import { deleteMediaAsset } from "@/lib/media/service";

type RouteContext = {
  params: Promise<{ clientKey: string; photoId: string }>;
};

const querySchema = z.object({
  studioId: z.string().trim().min(1),
});

export const runtime = "nodejs";

export async function DELETE(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const params = await ctx.params;
    if (!params.photoId) return jsonFail(400, "Validation error", "VALIDATION_ERROR");

    const query = parseQuery(new URL(req.url), querySchema);
    await ensureStudioRole({
      studioId: query.studioId,
      userId: user.id,
      allowed: [StudioRole.OWNER, StudioRole.ADMIN],
    });

    const plan = await getCurrentPlan(user.id, SubscriptionScope.STUDIO);
    ensureClientCardAccess(plan.tier);

    const studio = await prisma.studio.findUnique({
      where: { id: query.studioId },
      select: { id: true, providerId: true },
    });
    if (!studio) return jsonFail(404, "Студия не найдена", "STUDIO_NOT_FOUND");

    const photo = await prisma.clientCardPhoto.findUnique({
      where: { id: params.photoId },
      select: { id: true, mediaAssetId: true, card: { select: { id: true, providerId: true } } },
    });
    if (!photo || photo.card.providerId !== studio.providerId) {
      return jsonFail(404, "Фото не найдено", "NOT_FOUND");
    }

    await deleteMediaAsset(user, photo.mediaAssetId);
    await prisma.clientCardPhoto.delete({ where: { id: photo.id } });

    return jsonOk({ deleted: true });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("DELETE /api/studio/clients/[clientKey]/card/photos/[photoId] failed", {
        requestId: getRequestId(req),
        route: "DELETE /api/studio/clients/{clientKey}/card/photos/{photoId}",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
