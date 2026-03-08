import { CategoryStatus, MediaEntityType, MediaKind } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getCurrentMasterProviderId } from "@/lib/master/access";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ assetId: string }>;
};

export const runtime = "nodejs";

export async function GET(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const { assetId } = await ctx.params;
    if (!assetId) return jsonFail(400, "Validation error", "VALIDATION_ERROR");

    const masterId = await getCurrentMasterProviderId(user.id);
    const asset = await prisma.mediaAsset.findFirst({
      where: {
        id: assetId,
        deletedAt: null,
        kind: MediaKind.PORTFOLIO,
        entityType: MediaEntityType.MASTER,
        entityId: masterId,
      },
      select: {
        id: true,
        visualIndexed: true,
        visualCategory: true,
      },
    });

    if (!asset) {
      return jsonFail(404, "Not found", "NOT_FOUND");
    }

    if (!asset.visualIndexed) {
      return jsonOk({ status: "pending" as const });
    }

    const slug = asset.visualCategory?.trim() || null;
    if (!slug) {
      return jsonOk({ status: "unrecognized" as const });
    }

    const category = await prisma.globalCategory.findFirst({
      where: {
        visualSearchSlug: slug,
        status: CategoryStatus.APPROVED,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!category) {
      return jsonOk({ status: "unrecognized" as const });
    }

    return jsonOk({
      status: "classified" as const,
      suggestedSlug: slug,
      suggestedCategory: {
        id: category.id,
        title: category.name,
      },
    });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/master/portfolio/media/[assetId]/classification failed", {
        requestId: getRequestId(req),
        route: "GET /api/master/portfolio/media/{assetId}/classification",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
