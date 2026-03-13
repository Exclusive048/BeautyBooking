import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import {
  buildPrivateMediaDeliveryUrl,
  createPrivateMediaDeliveryToken,
} from "@/lib/media/private-delivery";
import { resolveMasterAccess } from "@/lib/model-offers/access";
import { getRequestId, logError } from "@/lib/logging/logger";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ offerId: string }>;
};

export const runtime = "nodejs";

export async function GET(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const params = await ctx.params;
    const offerId = params.offerId;
    if (!offerId) return jsonFail(400, "Validation error", "VALIDATION_ERROR");

    const offer = await prisma.modelOffer.findUnique({
      where: { id: offerId },
      select: {
        id: true,
        masterId: true,
        dateLocal: true,
        timeRangeStartLocal: true,
        timeRangeEndLocal: true,
        status: true,
      },
    });
    if (!offer) return jsonFail(404, "Offer not found", "NOT_FOUND");

    await resolveMasterAccess(offer.masterId, user.id);

    const applications = await prisma.modelApplication.findMany({
      where: { offerId: offer.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        clientNote: true,
        consentToShoot: true,
        proposedTimeLocal: true,
        confirmedStartAt: true,
        bookingId: true,
        createdAt: true,
        clientUser: { select: { id: true, displayName: true, phone: true } },
      },
    });

    const applicationIds = applications.map((item) => item.id);
    const mediaAssets =
      applicationIds.length === 0
        ? []
        : await prisma.mediaAsset.findMany({
            where: {
              entityType: "MODEL_APPLICATION",
              entityId: { in: applicationIds },
              kind: "MODEL_APPLICATION_PHOTO",
              deletedAt: null,
            },
            select: { id: true, entityId: true },
            orderBy: { createdAt: "asc" },
          });

    const mediaByApplication = new Map<string, { id: string; url: string }[]>();
    for (const asset of mediaAssets) {
      const list = mediaByApplication.get(asset.entityId) ?? [];
      const token = createPrivateMediaDeliveryToken({ assetId: asset.id });
      list.push({ id: asset.id, url: buildPrivateMediaDeliveryUrl(asset.id, token) });
      mediaByApplication.set(asset.entityId, list);
    }

    const items = applications.map((item) => ({
      id: item.id,
      status: item.status,
      clientNote: item.clientNote,
      consentToShoot: item.consentToShoot,
      proposedTimeLocal: item.proposedTimeLocal,
      confirmedStartAt: item.confirmedStartAt ? item.confirmedStartAt.toISOString() : null,
      bookingId: item.bookingId,
      createdAt: item.createdAt.toISOString(),
      client: {
        id: item.clientUser.id,
        displayName: item.clientUser.displayName?.trim() || item.clientUser.phone || "Client",
      },
      photos: mediaByApplication.get(item.id) ?? [],
    }));

    return jsonOk({
      offer: {
        id: offer.id,
        dateLocal: offer.dateLocal,
        timeRangeStartLocal: offer.timeRangeStartLocal,
        timeRangeEndLocal: offer.timeRangeEndLocal,
        status: offer.status,
      },
      applications: items,
    });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/master/model-offers/[offerId]/applications failed", {
        requestId: getRequestId(req),
        route: "GET /api/master/model-offers/{offerId}/applications",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
