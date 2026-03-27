import { z } from "zod";
import { SubscriptionScope, StudioRole } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentPlan } from "@/lib/billing/get-current-plan";
import { ensureClientCardAccess } from "@/lib/crm/guards";
import { getClientCardData, upsertClientCard } from "@/lib/crm/card-service";
import { clientCardPatchSchema } from "@/lib/crm/schemas";
import { validateClientTags } from "@/lib/crm/tags";
import { getRequestId, logError } from "@/lib/logging/logger";
import { prisma } from "@/lib/prisma";
import { ensureStudioRole } from "@/lib/studio/access";
import { parseBody, parseQuery } from "@/lib/validation";

type RouteContext = {
  params: Promise<{ clientKey: string }>;
};

const querySchema = z.object({
  studioId: z.string().trim().min(1),
});

export const runtime = "nodejs";

export async function GET(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const params = await ctx.params;
    if (!params.clientKey) return jsonFail(400, "Validation error", "VALIDATION_ERROR");

    const query = parseQuery(new URL(req.url), querySchema);
    await ensureStudioRole({
      studioId: query.studioId,
      userId: user.id,
      allowed: [StudioRole.OWNER, StudioRole.ADMIN],
    });

    const plan = await getCurrentPlan(user.id, SubscriptionScope.STUDIO);
    ensureClientCardAccess(plan.features);

    const studio = await prisma.studio.findUnique({
      where: { id: query.studioId },
      select: { id: true, providerId: true, provider: { select: { timezone: true } } },
    });
    if (!studio) return jsonFail(404, "Студия не найдена", "STUDIO_NOT_FOUND");

    const data = await getClientCardData({
      providerId: studio.providerId,
      timeZone: studio.provider.timezone,
      bookingWhere: { OR: [{ studioId: studio.id }, { providerId: studio.providerId }] },
      clientKey: params.clientKey,
    });
    return jsonOk(data);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/studio/clients/[clientKey]/card failed", {
        requestId: getRequestId(req),
        route: "GET /api/studio/clients/{clientKey}/card",
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

    const query = parseQuery(new URL(req.url), querySchema);
    await ensureStudioRole({
      studioId: query.studioId,
      userId: user.id,
      allowed: [StudioRole.OWNER, StudioRole.ADMIN],
    });

    const plan = await getCurrentPlan(user.id, SubscriptionScope.STUDIO);
    ensureClientCardAccess(plan.features);

    const studio = await prisma.studio.findUnique({
      where: { id: query.studioId },
      select: { id: true, providerId: true },
    });
    if (!studio) return jsonFail(404, "Студия не найдена", "STUDIO_NOT_FOUND");

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
      providerId: studio.providerId,
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
      logError("PATCH /api/studio/clients/[clientKey]/card failed", {
        requestId: getRequestId(req),
        route: "PATCH /api/studio/clients/{clientKey}/card",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
