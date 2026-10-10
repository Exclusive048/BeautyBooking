import { MediaEntityType, MediaKind } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getSessionUser } from "@/lib/auth/session";
import { mediaListQuerySchema, mediaUploadBodySchema } from "@/lib/media/schemas";
import { listMediaAssets, uploadMediaAsset } from "@/lib/media/service";
import {
  MEDIA_MAX_FILE_SIZE_BYTES,
} from "@/lib/media/types";
import { MEDIA_MAX_IMAGE_SIDE_PX } from "@/lib/media/image-resize";
import { readValidatedImageUpload } from "@/lib/media/validate-image-upload";
import { isStorageUnavailableError } from "@/lib/media/storage/unavailable";

export const runtime = "nodejs";

function formDataField(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  if (typeof value !== "string") return undefined;
  return value;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = mediaListQuerySchema.safeParse({
      entityType: url.searchParams.get("entityType"),
      entityId: url.searchParams.get("entityId"),
      kind: url.searchParams.get("kind") ?? undefined,
    });
    if (!parsed.success) {
      return jsonFail(400, "Проверьте правильность заполнения полей.", "VALIDATION_ERROR");
    }

    const user = await getSessionUser();
    const assets = await listMediaAssets(user, parsed.data);
    return jsonOk({ assets });
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("GET /api/media failed", {
        requestId,
        route: "GET /api/media",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Требуется вход в аккаунт.", "UNAUTHORIZED");

    const formData = await req.formData();
    const fileValue = formData.get("file");
    if (!(fileValue instanceof File)) {
      return jsonFail(400, "Прикрепите файл.", "MEDIA_FILE_REQUIRED");
    }

    const parsedBody = mediaUploadBodySchema.safeParse({
      entityType: formDataField(formData, "entityType"),
      entityId: formDataField(formData, "entityId"),
      kind: formDataField(formData, "kind"),
      replaceAssetId: formDataField(formData, "replaceAssetId"),
    });
    if (!parsedBody.success) {
      return jsonFail(400, "Проверьте правильность заполнения полей.", "VALIDATION_ERROR");
    }

    if (fileValue.size <= 0 || fileValue.size > MEDIA_MAX_FILE_SIZE_BYTES) {
      return jsonFail(400, "Файл слишком большой.", "MEDIA_FILE_TOO_LARGE");
    }

    // MEDIA-UPLOAD-DEDUP: общий примитив — sniff по магическим байтам →
    // allowlist → sharp re-encode с ограничением стороны → размер. Качество 95
    // сохранено, чтобы пользователь видел ту же картинку, что и до сведения.
    const upload = await readValidatedImageUpload(fileValue, { quality: 95, maxSidePx: MEDIA_MAX_IMAGE_SIDE_PX });
    const asset = await uploadMediaAsset(user, {
      entityType: parsedBody.data.entityType as MediaEntityType,
      entityId: parsedBody.data.entityId,
      kind: parsedBody.data.kind as MediaKind,
      replaceAssetId: parsedBody.data.replaceAssetId,
      mimeType: upload.mimeType,
      sizeBytes: upload.sizeBytes,
      bytes: upload.bytes,
      originalFilename: fileValue.name || "upload",
    });

    if ((parsedBody.data.kind as MediaKind) === MediaKind.PORTFOLIO) {
      return jsonOk(
        {
          asset,
          assetId: asset.id,
          url: asset.url,
          aiClassificationPending: true,
        },
        { status: 201 }
      );
    }

    return jsonOk({ asset }, { status: 201 });
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("POST /api/media failed", {
        requestId,
        route: "POST /api/media",
        stack: error instanceof Error ? error.stack : undefined,
        // STORAGE-UNAVAILABLE-01: об отказе хранилища алертит адаптер — один раз.
        __skipAlert: isStorageUnavailableError(error),
      });
    }
    return jsonFail(appError.status, appError.message, appError.code);
  }
}
