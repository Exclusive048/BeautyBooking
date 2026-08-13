import { NextResponse } from "next/server";
import { jsonFail } from "@/lib/api/contracts";
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
import { ensureCanReadMedia } from "@/lib/media/access";
import { mediaAssetIdParamSchema } from "@/lib/media/schemas";
import { getMediaFile, isProviderMediaPubliclyVisible } from "@/lib/media/service";
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
      return jsonFail(400, "Проверьте правильность заполнения полей.", "VALIDATION_ERROR");
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
      return jsonFail(404, "Файл не найден.", "MEDIA_ASSET_NOT_FOUND");
    }

    // SECURITY-EXPOSURE-AUDIT-01 #3: serve publicly ONLY when the asset is
    // actually public. A hidden (`isPublic:false`), unpublished-provider, or
    // delete-orphaned portfolio asset fails this and falls through to the
    // session/token path below, where `getMediaFile` → `ensureCanReadMedia`
    // restricts it to the owner/admin. (A soft-deleted asset is already 404'd
    // above.) Avatars/site assets stay public.
    const isPublicKind =
      PUBLIC_MEDIA_KINDS.has(asset.kind) && PUBLIC_MEDIA_ENTITY_TYPES.has(asset.entityType);
    if (isPublicKind && (await isProviderMediaPubliclyVisible(asset))) {
      const storage = getStorageProvider();
      const publicFile = await storage.getObject(asset.storageKey, asset.mimeType);
      if (!publicFile) {
        // Asset record exists in DB but bytes are missing in storage —
        // mark the row as BROKEN so the audit script can clean it up later.
        await prisma.mediaAsset
          .updateMany({
            where: { id: asset.id, deletedAt: null },
            data: { status: MediaAssetStatus.BROKEN },
          })
          .catch(() => undefined);

        void recordSurfaceEvent({
          surface: "media",
          outcome: "failure",
          operation: "public-stream",
          code: "STORAGE_MISSING",
        });
        logError("media.stream.s3_404", {
          requestId: getRequestId(req),
          assetId: asset.id,
          storageKey: asset.storageKey,
        });
        return jsonFail(404, "Файл не найден.", "MEDIA_ASSET_NOT_FOUND");
      }

      void recordSurfaceEvent({
        surface: "media",
        outcome: "success",
        operation: "public-stream",
      });
      return new NextResponse(Readable.toWeb(publicFile.stream) as ReadableStream, {
        status: 200,
        headers: {
          "Content-Type": publicFile.contentType,
          "Content-Length": String(publicFile.sizeBytes),
          // Public, immutable assets — agressive cache. Asset id is unique per upload,
          // so changing the file means changing the URL.
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
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
        return jsonFail(401, "Требуется вход в аккаунт.", "UNAUTHORIZED");
      }

      // SEC-10: токен отвечает на вопрос «какой актив», но не «кому можно».
      // Без второй половины утёкшая ссылка (referrer, скриншот, лог прокси)
      // открывает приватный актив кому угодно на срок жизни токена — до 15
      // минут. Соседний чат-роут именно поэтому токену в одиночку не верит:
      // `getSessionUser` + `getMediaFile` → `ensureCanReadMedia`. Приводим
      // ветку к той же модели, чтобы на одном механизме не жили две разные.
      // Флоу не задет: `?mt=`-ссылки выдаются только кабинету мастера на фото
      // откликов модели, а ACL `MODEL_APPLICATION` пускает и заявителя, и
      // владельца оффера.
      const tokenUser = await getSessionUser();
      await ensureCanReadMedia(tokenUser, asset.entityType, asset.entityId, asset.kind);

      const storage = getStorageProvider();
      const tokenFile = await storage.getObject(asset.storageKey, asset.mimeType);
      if (!tokenFile) {
        await prisma.mediaAsset
          .updateMany({
            where: { id: asset.id, deletedAt: null },
            data: { status: MediaAssetStatus.BROKEN },
          })
          .catch(() => undefined);

        return jsonFail(404, "Файл не найден.", "MEDIA_ASSET_NOT_FOUND");
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

    return jsonFail(appError.status, appError.message, appError.code);
  }
}
