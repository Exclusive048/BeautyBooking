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
import { readValidatedImageUpload } from "@/lib/media/validate-image-upload";
import { MEDIA_ATTACHMENT_MAX_IMAGE_SIDE_PX } from "@/lib/media/image-resize";

type RouteContext = {
  params: Promise<{ clientKey: string }>;
};

const PHOTO_LIMIT = 3;

export const runtime = "nodejs";

export async function POST(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Требуется вход в аккаунт.", "UNAUTHORIZED");

    const params = await ctx.params;
    if (!params.clientKey) return jsonFail(400, "Проверьте правильность заполнения полей.", "VALIDATION_ERROR");

    const providerId = await getCurrentMasterProviderId(user.id);
    const plan = await getCurrentPlan(user.id, SubscriptionScope.MASTER);
    ensureClientCardAccess(plan.features);

    const card = await ensureClientCard({ providerId, clientKey: params.clientKey });
    const existingCount = await prisma.clientCardPhoto.count({ where: { cardId: card.id } });
    if (existingCount >= PHOTO_LIMIT) {
      return jsonFail(409, "Больше фото в карточку не поместится. Удалите старое.", "PHOTO_LIMIT_REACHED", { limit: PHOTO_LIMIT });
    }

    const formData = await req.formData();
    const fileValue = formData.get("file");
    if (!(fileValue instanceof File)) {
      return jsonFail(400, "Файл обязателен", "MEDIA_FILE_REQUIRED");
    }

    // SEC-06: тип берётся из магических байтов и файл переупаковывается —
    // `fileValue.type` это заявление клиента, а не факт.
    const image = await readValidatedImageUpload(fileValue, {
      quality: 90,
      maxSidePx: MEDIA_ATTACHMENT_MAX_IMAGE_SIDE_PX,
    });
    const asset = await uploadMediaAsset(user, {
      entityType: MediaEntityType.CLIENT_CARD,
      entityId: card.id,
      kind: MediaKind.CLIENT_CARD_PHOTO,
      mimeType: image.mimeType,
      sizeBytes: image.sizeBytes,
      bytes: image.bytes,
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
