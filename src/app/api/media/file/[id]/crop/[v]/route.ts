import { NextResponse } from "next/server";
import { MediaAssetStatus, MediaEntityType, MediaKind } from "@prisma/client";
import { sharedCacheControlFor } from "@/lib/api/cache-headers";
import { jsonFail } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { ensureCanReadMedia } from "@/lib/media/access";
import { toCropArea } from "@/lib/media/crop-geometry";
import { renderCroppedImage } from "@/lib/media/crop-render";
import { mediaAssetIdParamSchema } from "@/lib/media/schemas";
import { isProviderMediaPubliclyVisible } from "@/lib/media/service";
import { getStorageProvider } from "@/lib/media/storage";
import { buildAvatarDisplayUrl, cropVersionToken } from "@/lib/media/types";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string; v: string }>;
};

export const runtime = "nodejs";

/**
 * CROP-PUBLIC-01 — картинка, вырезанная по сохранённой области обрезки.
 *
 * Отдаёт ТОТ ЖЕ актив, что `/api/media/file/[id]`, с той же моделью доступа:
 * публичная ветка — для аватаров/портфолио опубликованных кабинетов и сайта,
 * всё остальное — по сессии через `ensureCanReadMedia`. Режется всегда
 * СОХРАНЁННАЯ область из БД: сегмент `[v]` — только версия для кэшей, ему не
 * доверяют, поэтому подставить произвольные координаты нельзя. Устаревшая
 * версия (область с тех пор поменяли) уводит редиректом на актуальную ссылку,
 * а не отдаёт новый вырез под старым адресом, закэшированным как `immutable`.
 */
const PUBLIC_MEDIA_KINDS = new Set<MediaKind>([MediaKind.PORTFOLIO, MediaKind.AVATAR]);
const PUBLIC_MEDIA_ENTITY_TYPES = new Set<MediaEntityType>([
  MediaEntityType.MASTER,
  MediaEntityType.STUDIO,
  MediaEntityType.SITE,
]);

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function GET(req: Request, ctx: RouteContext) {
  try {
    const params = await ctx.params;
    const parsed = mediaAssetIdParamSchema.safeParse({ id: params.id });
    if (!parsed.success) {
      return jsonFail(400, "Проверьте правильность заполнения полей.", "VALIDATION_ERROR");
    }

    const asset = await prisma.mediaAsset.findUnique({
      where: { id: parsed.data.id },
      select: {
        id: true,
        entityId: true,
        storageKey: true,
        mimeType: true,
        status: true,
        kind: true,
        entityType: true,
        deletedAt: true,
        cropX: true,
        cropY: true,
        cropWidth: true,
        cropHeight: true,
      },
    });
    if (!asset || asset.deletedAt || asset.status !== MediaAssetStatus.READY) {
      return jsonFail(404, "Файл не найден.", "MEDIA_ASSET_NOT_FOUND");
    }

    const area = toCropArea(asset.cropX, asset.cropY, asset.cropWidth, asset.cropHeight);
    if (!area || params.v !== cropVersionToken(asset)) {
      // Области нет или она уже другая — ведём на то, что актуально сейчас.
      return NextResponse.redirect(new URL(buildAvatarDisplayUrl(asset), req.url), {
        status: 307,
        headers: { "Cache-Control": "no-store" },
      });
    }

    const isPublic =
      PUBLIC_MEDIA_KINDS.has(asset.kind) &&
      PUBLIC_MEDIA_ENTITY_TYPES.has(asset.entityType) &&
      (await isProviderMediaPubliclyVisible(asset));
    if (!isPublic) {
      const user = await getSessionUser();
      await ensureCanReadMedia(user, asset.entityType, asset.entityId, asset.kind);
    }

    const file = await getStorageProvider().getObject(asset.storageKey, asset.mimeType);
    if (!file) {
      return jsonFail(404, "Файл не найден.", "MEDIA_ASSET_NOT_FOUND");
    }
    const cropped = await renderCroppedImage(await streamToBuffer(file.stream), area);

    return new NextResponse(new Uint8Array(cropped), {
      status: 200,
      headers: {
        "Content-Type": "image/webp",
        "Content-Length": String(cropped.length),
        // Ссылка несёт версию области, поэтому ответ неизменен по построению —
        // та же политика, что у исходника в `/api/media/file/[id]`.
        "Cache-Control": isPublic
          ? sharedCacheControlFor(req, "public, max-age=31536000, immutable")
          : "private, no-store",
      },
    });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/media/file/[id]/crop/[v] failed", {
        requestId: getRequestId(req),
        route: "GET /api/media/file/{id}/crop/{v}",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code);
  }
}
