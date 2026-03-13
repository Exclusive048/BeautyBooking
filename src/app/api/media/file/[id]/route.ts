import { NextResponse } from "next/server";
import { MediaAssetStatus, MediaEntityType, MediaKind } from "@prisma/client";
import { Readable } from "stream";
import { getSessionUser } from "@/lib/auth/session";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";
import {
  PRIVATE_MEDIA_TOKEN_QUERY_PARAM,
  verifyPrivateMediaDeliveryToken,
} from "@/lib/media/private-delivery";
import { recordSurfaceEvent } from "@/lib/monitoring/status";
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
]);
const PUBLIC_MEDIA_ENTITY_TYPES = new Set<MediaEntityType>([
  MediaEntityType.MASTER,
  MediaEntityType.STUDIO,
  MediaEntityType.SITE,
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
        mimeType: true,
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

    if (PUBLIC_MEDIA_KINDS.has(asset.kind) && PUBLIC_MEDIA_ENTITY_TYPES.has(asset.entityType)) {
      const storage = getStorageProvider();
      const publicUrl = storage.getPublicUrl?.(asset.storageKey);
      if (publicUrl) {
        void recordSurfaceEvent({
          surface: "media",
          outcome: "success",
          operation: "public-redirect",
        });
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

    const mediaToken = new URL(req.url).searchParams.get(PRIVATE_MEDIA_TOKEN_QUERY_PARAM);
    if (mediaToken) {
      const isValidToken = verifyPrivateMediaDeliveryToken(mediaToken, asset.id);
      if (!isValidToken) {
        void recordSurfaceEvent({
          surface: "media",
          outcome: "denied",
          operation: "private-token",
          code: "INVALID_PRIVATE_MEDIA_TOKEN",
        });
        return NextResponse.json(
          { ok: false, error: { message: "Unauthorized", code: "UNAUTHORIZED" } },
          { status: 401 }
        );
      }

      const storage = getStorageProvider();
      const tokenFile = await storage.getObject(asset.storageKey, asset.mimeType);
      if (!tokenFile) {
        await prisma.mediaAsset
          .updateMany({
            where: { id: asset.id, deletedAt: null },
            data: { status: MediaAssetStatus.BROKEN },
          })
          .catch(() => undefined);

        return NextResponse.json(
          { ok: false, error: { message: "Media asset not found", code: "MEDIA_ASSET_NOT_FOUND" } },
          { status: 404 }
        );
      }

      void recordSurfaceEvent({
        surface: "media",
        outcome: "success",
        operation: "private-token",
      });
      return new NextResponse(Readable.toWeb(tokenFile.stream) as ReadableStream, {
        status: 200,
        headers: {
          "Content-Type": tokenFile.contentType,
          "Content-Length": String(tokenFile.sizeBytes),
          "Cache-Control": "private, no-store",
        },
      });
    }

    const user = await getSessionUser();
    const file = await getMediaFile(user, assetId);
    void recordSurfaceEvent({
      surface: "media",
      outcome: "success",
      operation: "private-session",
    });
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

    if (appError.status === 401 || appError.status === 403) {
      void recordSurfaceEvent({
        surface: "media",
        outcome: "denied",
        operation: "media-read",
        code: appError.code,
      });
    } else if (appError.status >= 500) {
      void recordSurfaceEvent({
        surface: "media",
        outcome: "failure",
        operation: "media-read",
        code: appError.code,
      });
    }

    return NextResponse.json(
      { ok: false, error: { message: appError.message, code: appError.code } },
      { status: appError.status }
    );
  }
}
