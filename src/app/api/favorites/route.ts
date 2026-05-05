import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const rows = await prisma.userFavorite.findMany({
      where: {
        userId: user.id,
        // Filter out unpublished providers at the read layer — favorites
        // outlive `isPublished` toggles by design (see favorite.prisma).
        provider: { isPublished: true },
      },
      orderBy: { createdAt: "desc" },
      include: {
        provider: {
          select: {
            id: true,
            type: true,
            name: true,
            tagline: true,
            publicUsername: true,
            avatarUrl: true,
            ratingAvg: true,
            reviews: true,
            priceFrom: true,
          },
        },
      },
    });

    const items = rows.map((row) => ({
      id: row.provider.id,
      type: row.provider.type === "STUDIO" ? "studio" : "master",
      publicUsername: row.provider.publicUsername,
      title: row.provider.name,
      tagline: row.provider.tagline?.trim() || null,
      avatarUrl: row.provider.avatarUrl,
      ratingAvg: row.provider.ratingAvg,
      reviewsCount: row.provider.reviews,
      minPrice: row.provider.priceFrom > 0 ? row.provider.priceFrom : null,
      favoritedAt: row.createdAt.toISOString(),
    }));

    return jsonOk({ items, totalCount: items.length });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/favorites failed", {
        requestId: getRequestId(req),
        route: "GET /api/favorites",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
