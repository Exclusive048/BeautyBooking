import { MediaEntityType, MediaKind } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getSessionUser } from "@/lib/auth/session";
import { mediaListQuerySchema, mediaUploadBodySchema } from "@/lib/media/schemas";
import { listMediaAssets, uploadMediaAsset } from "@/lib/media/service";

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

    const bytes = new Uint8Array(await fileValue.arrayBuffer());
    const asset = await uploadMediaAsset(user, {
      entityType: parsedBody.data.entityType as MediaEntityType,
      entityId: parsedBody.data.entityId,
      kind: parsedBody.data.kind as MediaKind,
      replaceAssetId: parsedBody.data.replaceAssetId,
      mimeType: fileValue.type,
      sizeBytes: fileValue.size,
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
