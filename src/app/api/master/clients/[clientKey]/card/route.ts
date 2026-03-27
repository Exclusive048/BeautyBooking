import { SubscriptionScope } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentPlan } from "@/lib/billing/get-current-plan";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getCurrentMasterProviderId } from "@/lib/master/access";
import { prisma } from "@/lib/prisma";
import { getClientCardData, upsertClientCard } from "@/lib/crm/card-service";
import { ensureClientCardAccess } from "@/lib/crm/guards";
import { clientCardPatchSchema } from "@/lib/crm/schemas";
import { validateClientTags } from "@/lib/crm/tags";
import { parseBody } from "@/lib/validation";

type RouteContext = {
  params: Promise<{ clientKey: string }>;
};

export const runtime = "nodejs";

export async function GET(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const params = await ctx.params;
    if (!params.clientKey) return jsonFail(400, "Validation error", "VALIDATION_ERROR");

    const providerId = await getCurrentMasterProviderId(user.id);
    const plan = await getCurrentPlan(user.id, SubscriptionScope.MASTER);
    ensureClientCardAccess(plan.features);

    const provider = await prisma.provider.findUnique({
      where: { id: providerId },
      select: { timezone: true },
    });
    if (!provider) return jsonFail(404, "Master not found", "MASTER_NOT_FOUND");

    const data = await getClientCardData({
      providerId,
      timeZone: provider.timezone,
      bookingWhere: { OR: [{ providerId }, { masterProviderId: providerId }] },
      clientKey: params.clientKey,
    });
    return jsonOk(data);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/master/clients/[clientKey]/card failed", {
        requestId: getRequestId(req),
        route: "GET /api/master/clients/{clientKey}/card",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

export async function PATCH(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const params = await ctx.params;
    if (!params.clientKey) return jsonFail(400, "Validation error", "VALIDATION_ERROR");

    const providerId = await getCurrentMasterProviderId(user.id);
    const plan = await getCurrentPlan(user.id, SubscriptionScope.MASTER);
    ensureClientCardAccess(plan.features);

    const body = await parseBody(req, clientCardPatchSchema);
    if (body.tags) {
      const validation = validateClientTags(body.tags);
      if (!validation.valid) {
        return jsonFail(400, "Некорректные теги", "VALIDATION_ERROR", {
          invalidTags: validation.invalid,
        });
      }
    }

    const notes =
      body.notes === undefined
        ? undefined
        : body.notes && body.notes.trim().length > 0
          ? body.notes.trim()
          : null;
    const updated = await upsertClientCard({
      providerId,
      clientKey: params.clientKey,
      notes,
      tags: body.tags,
    });

    return jsonOk({
      card: {
        id: updated.id,
        notes: updated.notes ?? null,
        tags: updated.tags,
      },
    });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("PATCH /api/master/clients/[clientKey]/card failed", {
        requestId: getRequestId(req),
        route: "PATCH /api/master/clients/{clientKey}/card",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
