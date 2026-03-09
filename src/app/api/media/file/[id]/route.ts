import { NextResponse } from "next/server";
import { MediaAssetStatus } from "@prisma/client";
import { getSessionUser } from "@/lib/auth/session";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";
import { mediaAssetIdParamSchema } from "@/lib/media/schemas";
import { getMediaFile } from "@/lib/media/service";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const runtime = "nodejs";

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
