import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { fail, tooManyRequests } from "@/lib/api/response";
import { formatZodError } from "@/lib/api/validation";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getSessionUser } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { routeRateLimitKey } from "@/lib/rate-limit/keys";
import { uploadChatAttachmentAsset } from "@/lib/media/service";
import {
  MEDIA_MAX_FILE_SIZE_BYTES,
} from "@/lib/media/types";
import { MEDIA_ATTACHMENT_MAX_IMAGE_SIDE_PX } from "@/lib/media/image-resize";
import { readValidatedImageUpload } from "@/lib/media/validate-image-upload";
import { z } from "zod";
import { isStorageUnavailableError } from "@/lib/media/storage/unavailable";

export const runtime = "nodejs";

/**
 * Chat-attachment image upload (CHAT-FOUNDATION-A-MIGRATION).
 *
 * Byte-for-byte mirror of `/api/bookings/upload-reference/route.ts`
 * with the only differences being the upload helper called
 * (`uploadChatAttachmentAsset` → kind=CHAT_ATTACHMENT,
 * entityType=CHAT_MESSAGE) and the per-user rate-limit key
 * namespace. The returned `assetId` is what the caller passes to
 * `POST /api/chat/threads/[slug]/messages` or
 * `POST /api/bookings/[id]/chat/messages` as `attachmentMediaAssetId`.
 */
const uploadAttachmentBodySchema = z.object({
  image: z
    .instanceof(File)
    .refine((file) => file.size > 0, "Image is required")
    .refine((file) => file.size <= MEDIA_MAX_FILE_SIZE_BYTES, "File is too large"),
});

const CHAT_ATTACHMENT_UPLOAD_RATE_LIMIT = {
  windowSeconds: 60 * 60,
  maxRequests: 30,
};

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return fail("Требуется вход в аккаунт.", 401, "UNAUTHORIZED");
    }

    const rateLimit = await checkRateLimit(
      routeRateLimitKey(req, "user", user.id),
      CHAT_ATTACHMENT_UPLOAD_RATE_LIMIT,
    );
    if (rateLimit.limited) {
      return tooManyRequests(rateLimit.retryAfterSeconds, "Слишком много загрузок. Попробуйте позже.");
    }

    const contentLengthHeader = req.headers.get("content-length");
    if (contentLengthHeader) {
      const contentLength = Number.parseInt(contentLengthHeader, 10);
      if (Number.isFinite(contentLength) && contentLength > MEDIA_MAX_FILE_SIZE_BYTES) {
        return jsonFail(413, "Файл слишком большой.", "MEDIA_FILE_TOO_LARGE");
      }
    }

    const formData = await req.formData();
    const parsed = uploadAttachmentBodySchema.safeParse({
      image: formData.get("image"),
    });
    if (!parsed.success) {
      return fail("Проверьте правильность заполнения полей.", 400, "BAD_REQUEST", formatZodError(parsed.error));
    }
    const { image: fileValue } = parsed.data;

    if (fileValue.size > MEDIA_MAX_FILE_SIZE_BYTES) {
      return jsonFail(413, "Файл слишком большой.", "MEDIA_FILE_TOO_LARGE");
    }

    // MEDIA-UPLOAD-DEDUP: общий примитив — sniff по магическим байтам →
    // allowlist → sharp re-encode с ограничением стороны → размер. Качество 90
    // сохранено, чтобы пользователь видел ту же картинку, что и до сведения.
    const upload = await readValidatedImageUpload(fileValue, { quality: 90, maxSidePx: MEDIA_ATTACHMENT_MAX_IMAGE_SIDE_PX });
    const asset = await uploadChatAttachmentAsset(user, {
      mimeType: upload.mimeType,
      sizeBytes: upload.sizeBytes,
      bytes: upload.bytes,
      originalFilename: fileValue.name || "upload",
    });

    return jsonOk({ assetId: asset.id }, { status: 201 });
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("POST /api/chat/upload-attachment failed", {
        requestId,
        route: "POST /api/chat/upload-attachment",
        stack: error instanceof Error ? error.stack : undefined,
        // STORAGE-UNAVAILABLE-01: об отказе хранилища алертит адаптер — один раз.
        __skipAlert: isStorageUnavailableError(error),
      });
    }
    return jsonFail(appError.status, appError.message, appError.code);
  }
}
