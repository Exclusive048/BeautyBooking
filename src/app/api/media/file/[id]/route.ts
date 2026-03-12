import { NextResponse } from "next/server";
import { MediaAssetStatus, MediaEntityType, MediaKind } from "@prisma/client";
import { getSessionUser } from "@/lib/auth/session";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";
import { mediaAssetIdParamSchema } from "@/lib/media/schemas";
import { getMediaFile } from "@/lib/media/service";
import { getStorageProvider } from "@/lib/media/storage";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const runtime = "nodejs";
const PUBLIC_MEDIA_KINDS = new Set<MediaKind>([
  MediaKind.PORTFOLIO,
  MediaKind.AVATAR,
  MediaKind.MODEL_APPLICATION_PHOTO,
]);
const PUBLIC_MEDIA_ENTITY_TYPES = new Set<MediaEntityType>([
  MediaEntityType.MASTER,
  MediaEntityType.STUDIO,
  MediaEntityType.SITE,
  MediaEntityType.MODEL_APPLICATION,
]);

function isStorageMissingErrorDetails(details: unknown): boolean {
  if (!details || typeof details !== "object") return false;
  return (details as { reason?: unknown }).reason === "STORAGE_MISSING";
}

export async function GET(req: Request, ctx: RouteContext) {
  let assetId: string | null = null;
  try {
    const params = await ctx.params;
    const parsed = mediaAssetIdParamSchema.safeParse(params);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { message: "Validation error", code: "VALIDATION_ERROR" } },
        { status: 400 }
      );
    }
    assetId = parsed.data.id;

    const asset = await prisma.mediaAsset.findUnique({
      where: { id: assetId },
      select: {
        id: true,
        entityId: true,
        storageKey: true,
        status: true,
        kind: true,
        entityType: true,
        deletedAt: true,
      },
    });
    if (!asset || asset.deletedAt || asset.status !== MediaAssetStatus.READY) {
      return NextResponse.json(
        { ok: false, error: { message: "Media asset not found", code: "MEDIA_ASSET_NOT_FOUND" } },
        { status: 404 }
      );
    }

    if (
      asset.kind === MediaKind.MODEL_APPLICATION_PHOTO ||
      asset.entityType === MediaEntityType.MODEL_APPLICATION
    ) {
      const storage = getStorageProvider();
      const publicUrl = storage.getPublicUrl?.(asset.storageKey);
      if (publicUrl) {
        return new NextResponse(null, {
          status: 302,
          headers: {
            Location: publicUrl,
            "Cache-Control": "public, max-age=3600",
          },
        });
      }
    }

    if (PUBLIC_MEDIA_KINDS.has(asset.kind) && PUBLIC_MEDIA_ENTITY_TYPES.has(asset.entityType)) {
      const storage = getStorageProvider();
      const publicUrl = storage.getPublicUrl?.(asset.storageKey);
      if (publicUrl) {
        const location = new URL(publicUrl, req.url).toString();
        return new NextResponse(null, {
          status: 302,
          headers: {
            Location: location,
            "Cache-Control": "public, max-age=86400",
          },
        });
      }
    }

    const user = await getSessionUser();
    const file = await getMediaFile(user, assetId);
    return new NextResponse(file.stream, {
      status: 200,
      headers: {
        "Content-Type": file.contentType,
        "Content-Length": String(file.contentLength),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const appError = toAppError(error);
    if (
      appError.status === 404 &&
      appError.code === "MEDIA_ASSET_NOT_FOUND" &&
      assetId &&
      isStorageMissingErrorDetails(appError.details)
    ) {
      await prisma.mediaAsset
        .updateMany({
          where: { id: assetId, deletedAt: null },
          data: { status: MediaAssetStatus.BROKEN },
        })
        .catch(() => undefined);
    }
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("GET /api/media/file/[id] failed", {
        requestId,
        route: "GET /api/media/file/{id}",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return NextResponse.json(
      { ok: false, error: { message: appError.message, code: appError.code } },
      { status: appError.status }
    );
  }
}
