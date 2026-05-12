import { NextResponse } from "next/server";
import { jsonFail } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Public list of cities visible in the city selector and first-visit popup.
 *
 * Filter rules:
 *   - `isActive: true` — admin can hide a city without deleting it.
 *   - `providers.some(isPublished: true)` — empty cities (auto-created from a
 *     master who later unpublished) don't surface to clients.
 *
 * Cached for 5 minutes via response headers — selector is dropdown-frequent
 * and the underlying data changes slowly.
 */
const CACHE_HEADERS: HeadersInit = {
  "Cache-Control": "public, max-age=300, s-maxage=300",
};

export async function GET(req: Request) {
  try {
    const cities = await prisma.city.findMany({
      where: {
        isActive: true,
        providers: { some: { isPublished: true } },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        slug: true,
        name: true,
        nameGenitive: true,
        latitude: true,
        longitude: true,
      },
    });

    return NextResponse.json(
      { ok: true, data: { items: cities } },
      { headers: CACHE_HEADERS },
    );
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/cities failed", {
        requestId: getRequestId(req),
        route: "GET /api/cities",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
