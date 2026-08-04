import { StudioRole } from "@prisma/client";
import { z } from "zod";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { ensureStudioRole } from "@/lib/studio/access";
import { updateStudioServiceSchema } from "@/lib/studio/schemas";
import {
  deleteStudioService,
  updateStudioService,
} from "@/lib/studio/services.service";
import { parseBody, parseQuery } from "@/lib/validation";
import { SubscriptionScope } from "@prisma/client";
import { getCurrentPlan } from "@/lib/billing/get-current-plan";
import { createFeatureGateError, createSystemDisabledError } from "@/lib/billing/guards";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const runtime = "nodejs";

export async function PATCH(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Требуется вход в аккаунт.", "UNAUTHORIZED");

    const { id } = await ctx.params;
    if (!id) return jsonFail(400, "Проверьте правильность заполнения полей.", "VALIDATION_ERROR");
    const body = await parseBody(req, updateStudioServiceSchema);
    await ensureStudioRole({
      studioId: body.studioId,
      userId: user.id,
      allowed: [StudioRole.OWNER, StudioRole.ADMIN],
    });

    if (body.onlinePaymentEnabled === true) {
      const plan = await getCurrentPlan(user.id, SubscriptionScope.STUDIO);
      if (!plan.features.onlinePayments) {
        throw createFeatureGateError("onlinePayments", "PRO");
      }
      if (!plan.system.onlinePaymentsEnabled) {
        throw createSystemDisabledError("onlinePayments");
      }
    }

    const data = await updateStudioService({
      studioId: body.studioId,
      serviceId: id,
      categoryId: body.categoryId,
      globalCategoryId: body.globalCategoryId,
      title: body.title,
      description: body.description,
      basePrice: body.basePrice,
      baseDurationMin: body.baseDurationMin,
      isActive: body.isActive,
      onlinePaymentEnabled: body.onlinePaymentEnabled,
    });
    return jsonOk(data);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("PATCH /api/studio/services/[id] failed", {
        requestId: getRequestId(req),
        route: "PATCH /api/studio/services/{id}",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

const deleteQuerySchema = z.object({ studioId: z.string().trim().min(1) });

export async function DELETE(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Требуется вход в аккаунт.", "UNAUTHORIZED");
    const { id } = await ctx.params;
    if (!id) return jsonFail(400, "Проверьте правильность заполнения полей.", "VALIDATION_ERROR");
    const query = parseQuery(new URL(req.url), deleteQuerySchema);

    await ensureStudioRole({
      studioId: query.studioId,
      userId: user.id,
      allowed: [StudioRole.OWNER, StudioRole.ADMIN],
    });

    const data = await deleteStudioService({
      studioId: query.studioId,
      serviceId: id,
    });
    return jsonOk(data);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("DELETE /api/studio/services/[id] failed", {
        requestId: getRequestId(req),
        route: "DELETE /api/studio/services/{id}",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
