import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { fail } from "@/lib/api/response";
import { formatZodError } from "@/lib/api/validation";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getSessionUser } from "@/lib/auth/session";
import { uploadBookingReferenceAsset } from "@/lib/media/service";
import {
  MEDIA_ALLOWED_MIME_TYPES,
  MEDIA_MAX_FILE_SIZE_BYTES,
  type AllowedMediaMimeType,
} from "@/lib/media/types";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { z } from "zod";

export const runtime = "nodejs";

const uploadReferenceBodySchema = z.object({
  image: z
    .instanceof(File)
    .refine((file) => file.size > 0, "Image is required")
    .refine((file) => file.size <= MEDIA_MAX_FILE_SIZE_BYTES, "File is too large"),
});

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    const formData = await req.formData();
    const parsed = uploadReferenceBodySchema.safeParse({
      image: formData.get("image"),
    });
    if (!parsed.success) {
      return fail("Validation error", 400, "BAD_REQUEST", formatZodError(parsed.error));
    }
    const { image: fileValue } = parsed.data;

    const rawBuffer = Buffer.from(await fileValue.arrayBuffer());
    const detected = await fileTypeFromBuffer(rawBuffer);
    if (!detected || !MEDIA_ALLOWED_MIME_TYPES.includes(detected.mime as AllowedMediaMimeType)) {
      return jsonFail(415, "Unsupported image type", "MEDIA_INVALID_MIME");
    }

    let outputMime: AllowedMediaMimeType = detected.mime as AllowedMediaMimeType;
    let outputBuffer: Buffer;

    if (detected.mime === "image/png") {
      outputMime = "image/webp";
      outputBuffer = await sharp(rawBuffer).webp({ quality: 90 }).toBuffer();
    } else if (detected.mime === "image/jpeg") {
      outputMime = "image/jpeg";
      outputBuffer = await sharp(rawBuffer).jpeg({ quality: 90 }).toBuffer();
    } else {
      outputMime = "image/webp";
      outputBuffer = await sharp(rawBuffer).webp({ quality: 90 }).toBuffer();
    }

    if (outputBuffer.length <= 0 || outputBuffer.length > MEDIA_MAX_FILE_SIZE_BYTES) {
      return jsonFail(400, "File is too large", "MEDIA_FILE_TOO_LARGE");
    }

    const bytes = new Uint8Array(outputBuffer);
    const asset = await uploadBookingReferenceAsset(user, {
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
      logError("POST /api/bookings/upload-reference failed", {
        requestId,
        route: "POST /api/bookings/upload-reference",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code);
  }
}
