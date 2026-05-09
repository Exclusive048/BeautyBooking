import { SubscriptionScope } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentPlan } from "@/lib/billing/get-current-plan";
import { createFeatureGateError, createSystemDisabledError } from "@/lib/billing/guards";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getCurrentMasterProviderId } from "@/lib/master/access";
import {
  deleteMasterService,
  updateMasterService,
} from "@/lib/master/services-mutations";
import { updateMasterServiceSchema } from "@/lib/master/schemas";
import { parseBody } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

/**
 * Per-service PATCH/DELETE for the 31c services management page. The
 * legacy bulk `PUT /api/master/services` (used by studio-shared catalog)
 * remains untouched. Online-payment toggle is plan-gated (PRO+).
 */
export async function PATCH(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");
    const { id } = await ctx.params;
    if (!id) return jsonFail(400, "Validation error", "VALIDATION_ERROR");

    const body = await parseBody(req, updateMasterServiceSchema);
    if (body.onlinePaymentEnabled === true) {
      const plan = await getCurrentPlan(user.id, SubscriptionScope.MASTER);
      if (!plan.features.onlinePayments) {
        throw createFeatureGateError("onlinePayments", "PRO");
      }
      if (!plan.system.onlinePaymentsEnabled) {
        throw createSystemDisabledError("onlinePayments");
      }
    }

    const masterId = await getCurrentMasterProviderId(user.id);
    const data = await updateMasterService(masterId, id, body);
    return jsonOk(data);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("PATCH /api/master/services/[id] failed", {
        requestId: getRequestId(req),
        route: "PATCH /api/master/services/{id}",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

export async function DELETE(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");
    const { id } = await ctx.params;
    if (!id) return jsonFail(400, "Validation error", "VALIDATION_ERROR");

    const masterId = await getCurrentMasterProviderId(user.id);
    const data = await deleteMasterService(masterId, id);
    return jsonOk(data);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("DELETE /api/master/services/[id] failed", {
        requestId: getRequestId(req),
        route: "DELETE /api/master/services/{id}",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
