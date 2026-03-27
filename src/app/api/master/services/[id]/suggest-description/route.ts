import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getAiFeaturesEnabled } from "@/lib/ai/config";
import { suggestServiceDescription } from "@/lib/ai/service-description";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMITS } from "@/lib/rate-limit/configs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const runtime = "nodejs";

export async function POST(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return jsonFail(401, "Unauthorized", "UNAUTHORIZED");
    }

    const enabled = await getAiFeaturesEnabled();
    if (!enabled) {
      return jsonFail(503, "AI features are disabled", "SYSTEM_FEATURE_DISABLED");
    }

    const limit = await checkRateLimit(
      `rl:ai:suggest-description:${user.id}`,
      RATE_LIMITS.aiSuggestDescription,
    );
    if (limit.limited) {
      return jsonFail(429, "Too many requests", "RATE_LIMITED");
    }

    const { id: serviceId } = await ctx.params;

    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      select: {
        id: true,
        name: true,
        title: true,
        price: true,
        durationMin: true,
        provider: {
          select: {
            ownerUserId: true,
            masterProfile: { select: { userId: true } },
          },
        },
        globalCategory: { select: { name: true } },
      },
    });

    if (!service) {
      return jsonFail(404, "Service not found", "SERVICE_NOT_FOUND");
    }

    const isOwner =
      service.provider.ownerUserId === user.id ||
      service.provider.masterProfile?.userId === user.id;

    if (!isOwner) {
      return jsonFail(403, "Forbidden", "FORBIDDEN");
    }

    const suggestion = await suggestServiceDescription({
      name: service.title || service.name,
      category: service.globalCategory?.name ?? "",
      price: service.price,
      durationMin: service.durationMin,
    });

    if (!suggestion) {
      return jsonFail(500, "Failed to generate description", "INTERNAL_ERROR");
    }

    return jsonOk({ suggestion });
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("POST /api/master/services/[id]/suggest-description failed", {
        requestId,
        route: "POST /api/master/services/{id}/suggest-description",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
