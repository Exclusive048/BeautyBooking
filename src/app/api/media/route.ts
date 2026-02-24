import { MediaEntityType, MediaKind } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getSessionUser } from "@/lib/auth/session";
import { mediaListQuerySchema, mediaUploadBodySchema } from "@/lib/media/schemas";
import { listMediaAssets, uploadMediaAsset } from "@/lib/media/service";
import {
  MEDIA_ALLOWED_MIME_TYPES,
  MEDIA_MAX_FILE_SIZE_BYTES,
  type AllowedMediaMimeType,
} from "@/lib/media/types";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";

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
      return jsonFail(400, "Validation error", "VALIDATION_ERROR");
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
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const formData = await req.formData();
    const fileValue = formData.get("file");
    if (!(fileValue instanceof File)) {
      return jsonFail(400, "File is required", "MEDIA_FILE_REQUIRED");
    }

    const parsedBody = mediaUploadBodySchema.safeParse({
      entityType: formDataField(formData, "entityType"),
      entityId: formDataField(formData, "entityId"),
      kind: formDataField(formData, "kind"),
      replaceAssetId: formDataField(formData, "replaceAssetId"),
    });
    if (!parsedBody.success) {
      return jsonFail(400, "Validation error", "VALIDATION_ERROR");
    }

    if (fileValue.size <= 0 || fileValue.size > MEDIA_MAX_FILE_SIZE_BYTES) {
      return jsonFail(400, "File is too large", "MEDIA_FILE_TOO_LARGE");
    }

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
    const asset = await uploadMediaAsset(user, {
      entityType: parsedBody.data.entityType as MediaEntityType,
      entityId: parsedBody.data.entityId,
      kind: parsedBody.data.kind as MediaKind,
      replaceAssetId: parsedBody.data.replaceAssetId,
      mimeType: outputMime,
      sizeBytes: outputBuffer.length,
      bytes,
      originalFilename: fileValue.name || "upload",
    });
    return jsonOk({ asset }, { status: 201 });
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("POST /api/media failed", {
        requestId,
        route: "POST /api/media",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code);
  }
}
