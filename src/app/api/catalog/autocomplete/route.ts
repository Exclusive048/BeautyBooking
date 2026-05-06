import { z } from "zod";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";
import { parseQuery } from "@/lib/validation";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const querySchema = z.object({
  q: z.string().trim().min(2).max(50),
  citySlug: z.string().trim().min(1).max(40).optional(),
});

const CATEGORY_LIMIT = 5;
const PROVIDER_LIMIT = 6;

/**
 * Grouped autocomplete for the catalog search bar — returns approved
 * top-level + sub categories whose name matches `q`, plus published
 * providers whose name matches. Both queries run in parallel; rate limit
 * is intentionally absent (read-only public data, debounced 300ms on the
 * client and capped to 5+6 rows per call).
 */
export async function GET(req: Request) {
  try {
    const { q, citySlug } = parseQuery(new URL(req.url), querySchema);

    const [categories, providers] = await Promise.all([
      prisma.globalCategory.findMany({
        where: {
          status: "APPROVED",
          visibleToAll: true,
          name: { contains: q, mode: "insensitive" },
        },
        select: {
          id: true,
          name: true,
          slug: true,
          parentId: true,
        },
        orderBy: { name: "asc" },
        take: CATEGORY_LIMIT,
      }),
      prisma.provider.findMany({
        where: {
          isPublished: true,
          publicUsername: { not: null },
          name: { contains: q, mode: "insensitive" },
          ...(citySlug ? { city: { slug: citySlug } } : {}),
        },
        select: {
          id: true,
          name: true,
          publicUsername: true,
          type: true,
          ratingAvg: true,
          ratingCount: true,
          avatarUrl: true,
        },
        orderBy: [{ ratingAvg: "desc" }, { ratingCount: "desc" }],
        take: PROVIDER_LIMIT,
      }),
    ]);

    return jsonOk({
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        parentId: c.parentId,
      })),
      providers: providers.map((p) => ({
        id: p.id,
        name: p.name,
        publicUsername: p.publicUsername,
        type: p.type === "STUDIO" ? ("studio" as const) : ("master" as const),
        ratingAvg: p.ratingAvg,
        ratingCount: p.ratingCount,
        avatarUrl: p.avatarUrl,
      })),
    });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/catalog/autocomplete failed", {
        requestId: getRequestId(req),
        route: "GET /api/catalog/autocomplete",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
