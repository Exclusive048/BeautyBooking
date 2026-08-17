import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { fail, tooManyRequests } from "@/lib/api/response";
import { formatZodError } from "@/lib/api/validation";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getSessionUser } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { uploadChatAttachmentAsset } from "@/lib/media/service";
import {
  MEDIA_ALLOWED_MIME_TYPES,
  MEDIA_MAX_FILE_SIZE_BYTES,
  type AllowedMediaMimeType,
} from "@/lib/media/types";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { capLongestSide, MEDIA_ATTACHMENT_MAX_IMAGE_SIDE_PX } from "@/lib/media/image-resize";
import { z } from "zod";

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
      `rl:/api/chat/upload-attachment:user:${user.id}`,
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

    const rawBuffer = Buffer.from(await fileValue.arrayBuffer());
    const detected = await fileTypeFromBuffer(rawBuffer);
    if (!detected || !MEDIA_ALLOWED_MIME_TYPES.includes(detected.mime as AllowedMediaMimeType)) {
      return jsonFail(415, "Неподдерживаемый формат изображения.", "MEDIA_INVALID_MIME");
    }

    let outputMime: AllowedMediaMimeType = detected.mime as AllowedMediaMimeType;
    let outputBuffer: Buffer;

    // PERF-07: без ресайза оригинал до 10 МБ уезжал прямо в браузер —
    // `next/image` тут не применяется осознанно (роут отдачи держит
    // cookie-auth + токен). Порог — см. `image-resize.ts`.
    const resized = capLongestSide(sharp(rawBuffer), MEDIA_ATTACHMENT_MAX_IMAGE_SIDE_PX);
    if (detected.mime === "image/png") {
      outputMime = "image/webp";
      outputBuffer = await resized.webp({ quality: 90 }).toBuffer();
    } else if (detected.mime === "image/jpeg") {
      outputMime = "image/jpeg";
      outputBuffer = await resized.jpeg({ quality: 90 }).toBuffer();
    } else {
      outputMime = "image/webp";
      outputBuffer = await resized.webp({ quality: 90 }).toBuffer();
    }

    if (outputBuffer.length <= 0 || outputBuffer.length > MEDIA_MAX_FILE_SIZE_BYTES) {
      return jsonFail(400, "Файл слишком большой.", "MEDIA_FILE_TOO_LARGE");
    }

    const bytes = new Uint8Array(outputBuffer);
    const asset = await uploadChatAttachmentAsset(user, {
      mimeType: outputMime,
      sizeBytes: outputBuffer.length,
      bytes,
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
      });
    }
    return jsonFail(appError.status, appError.message, appError.code);
  }
}
