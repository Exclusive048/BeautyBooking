import { SubscriptionScope } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentPlan } from "@/lib/billing/get-current-plan";
import { ensureClientCardAccess } from "@/lib/crm/guards";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getCurrentMasterProviderId } from "@/lib/master/access";
import { prisma } from "@/lib/prisma";
import { deleteMediaAsset } from "@/lib/media/service";

type RouteContext = {
  params: Promise<{ clientKey: string; photoId: string }>;
};

export const runtime = "nodejs";

export async function DELETE(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const params = await ctx.params;
    if (!params.photoId) return jsonFail(400, "Validation error", "VALIDATION_ERROR");

    const providerId = await getCurrentMasterProviderId(user.id);
    const plan = await getCurrentPlan(user.id, SubscriptionScope.MASTER);
    ensureClientCardAccess(plan.tier);

    const photo = await prisma.clientCardPhoto.findUnique({
      where: { id: params.photoId },
      select: { id: true, mediaAssetId: true, card: { select: { id: true, providerId: true } } },
    });
    if (!photo || photo.card.providerId !== providerId) {
      return jsonFail(404, "Фото не найдено", "NOT_FOUND");
    }

    await deleteMediaAsset(user, photo.mediaAssetId);
    await prisma.clientCardPhoto.delete({ where: { id: photo.id } });

    return jsonOk({ deleted: true });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("DELETE /api/master/clients/[clientKey]/card/photos/[photoId] failed", {
        requestId: getRequestId(req),
        route: "DELETE /api/master/clients/{clientKey}/card/photos/{photoId}",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
