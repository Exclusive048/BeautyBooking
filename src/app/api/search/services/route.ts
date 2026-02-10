import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = url.searchParams.get("q")?.trim() ?? "";
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : DEFAULT_LIMIT;
    const take = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), MAX_LIMIT) : DEFAULT_LIMIT;

    if (query.length < 2) {
      return jsonOk({ items: [] });
    }

    const services = await prisma.service.findMany({
      where: {
        isEnabled: true,
        isActive: true,
        provider: { isPublished: true, publicUsername: { not: null } },
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { title: { contains: query, mode: "insensitive" } },
        ],
      },
      take,
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        name: true,
        title: true,
      },
    });

    const items = services.map((service) => ({
      id: service.id,
      title: service.title?.trim() || service.name,
    }));

    return jsonOk({ items });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/search/services failed", {
        requestId: getRequestId(req),
        route: "GET /api/search/services",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
