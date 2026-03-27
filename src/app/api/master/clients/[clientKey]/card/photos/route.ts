import { MediaEntityType, MediaKind, SubscriptionScope } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentPlan } from "@/lib/billing/get-current-plan";
import { ensureClientCardAccess } from "@/lib/crm/guards";
import { ensureClientCard } from "@/lib/crm/card-service";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getCurrentMasterProviderId } from "@/lib/master/access";
import { prisma } from "@/lib/prisma";
import { uploadMediaAsset } from "@/lib/media/service";

type RouteContext = {
  params: Promise<{ clientKey: string }>;
};

const PHOTO_LIMIT = 3;

export const runtime = "nodejs";

export async function POST(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const params = await ctx.params;
    if (!params.clientKey) return jsonFail(400, "Validation error", "VALIDATION_ERROR");

    const providerId = await getCurrentMasterProviderId(user.id);
    const plan = await getCurrentPlan(user.id, SubscriptionScope.MASTER);
    ensureClientCardAccess(plan.features);

    const card = await ensureClientCard({ providerId, clientKey: params.clientKey });
    const existingCount = await prisma.clientCardPhoto.count({ where: { cardId: card.id } });
    if (existingCount >= PHOTO_LIMIT) {
      return jsonFail(409, "Достигнут лимит фото", "PHOTO_LIMIT_REACHED", { limit: PHOTO_LIMIT });
    }

    const formData = await req.formData();
    const fileValue = formData.get("file");
    if (!(fileValue instanceof File)) {
      return jsonFail(400, "Файл обязателен", "MEDIA_FILE_REQUIRED");
    }

    const bytes = new Uint8Array(await fileValue.arrayBuffer());
    const asset = await uploadMediaAsset(user, {
      entityType: MediaEntityType.CLIENT_CARD,
      entityId: card.id,
      kind: MediaKind.CLIENT_CARD_PHOTO,
      mimeType: fileValue.type,
      sizeBytes: fileValue.size,
      bytes,
      originalFilename: fileValue.name || "photo",
    });

    const created = await prisma.clientCardPhoto.create({
      data: { cardId: card.id, mediaAssetId: asset.id },
      select: { id: true, caption: true, createdAt: true, mediaAssetId: true },
    });

    return jsonOk(
      {
        photo: {
          id: created.id,
          caption: created.caption ?? null,
          url: `/api/media/file/${created.mediaAssetId}`,
          createdAt: created.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/master/clients/[clientKey]/card/photos failed", {
        requestId: getRequestId(req),
        route: "POST /api/master/clients/{clientKey}/card/photos",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
