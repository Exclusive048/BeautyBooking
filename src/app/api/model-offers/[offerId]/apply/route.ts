import { AccountType } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { applyModelOfferSchema } from "@/lib/model-offers/schemas";
import { loadApplicationWithRelations, notifyModelApplicationReceived } from "@/lib/notifications/model-notifications";
import { parseBody } from "@/lib/validation";
import { getRequestId, logError } from "@/lib/logging/logger";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ offerId: string }>;
};

export const runtime = "nodejs";

export async function POST(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");
    if (!user.roles.includes(AccountType.CLIENT)) {
      return jsonFail(403, "Forbidden", "FORBIDDEN");
    }

    const params = await ctx.params;
    const offerId = params.offerId;
    if (!offerId) return jsonFail(400, "Validation error", "VALIDATION_ERROR");

    const body = await parseBody(req, applyModelOfferSchema);

    const offer = await prisma.modelOffer.findUnique({
      where: { id: offerId },
      select: {
        id: true,
        status: true,
        masterId: true,
        dateLocal: true,
        timeRangeStartLocal: true,
        timeRangeEndLocal: true,
        master: {
          select: { id: true, ownerUserId: true, masterProfile: { select: { userId: true } }, name: true },
        },
      },
    });
    if (!offer) return jsonFail(404, "Offer not found", "NOT_FOUND");
    if (offer.status !== "ACTIVE") {
      return jsonFail(409, "Offer is not active", "CONFLICT");
    }

    const existing = await prisma.modelApplication.findUnique({
      where: {
        offerId_clientUserId: {
          offerId: offer.id,
          clientUserId: user.id,
        },
      },
      select: { id: true },
    });
    if (existing) {
      return jsonFail(409, "Application already exists", "ALREADY_EXISTS");
    }

    const mediaAssets = await prisma.mediaAsset.findMany({
      where: {
        id: { in: body.mediaIds },
        createdByUserId: user.id,
        kind: "MODEL_APPLICATION_PHOTO",
        deletedAt: null,
      },
      select: { id: true, entityType: true, entityId: true },
    });
    if (mediaAssets.length !== body.mediaIds.length) {
      return jsonFail(400, "Invalid media assets", "MEDIA_ASSET_NOT_FOUND");
    }
    const invalidAsset = mediaAssets.find(
      (asset) => asset.entityType !== "USER" || asset.entityId !== user.id
    );
    if (invalidAsset) {
      return jsonFail(409, "Media asset already in use", "CONFLICT");
    }

    const created = await prisma.modelApplication.create({
      data: {
        offerId: offer.id,
        clientUserId: user.id,
        status: "PENDING",
        consentToShoot: true,
        clientNote: body.note?.trim() || null,
      },
      select: { id: true, status: true, createdAt: true },
    });

    const updateResult = await prisma.mediaAsset.updateMany({
      where: { id: { in: body.mediaIds } },
      data: { entityType: "MODEL_APPLICATION", entityId: created.id },
    });
    if (updateResult.count !== body.mediaIds.length) {
      await prisma.modelApplication.delete({ where: { id: created.id } }).catch(() => undefined);
      throw new Error("Media attach failed");
    }

    const application = await loadApplicationWithRelations(created.id);
    if (application) {
      await notifyModelApplicationReceived(application);
    }

    return jsonOk(
      {
        application: {
          id: created.id,
          status: created.status,
          createdAt: created.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/model-offers/[offerId]/apply failed", {
        requestId: getRequestId(req),
        route: "POST /api/model-offers/{offerId}/apply",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
