import { SubscriptionScope } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentPlan } from "@/lib/billing/get-current-plan";
import { createFeatureGateError } from "@/lib/billing/guards";
import { getOrCreateDiscountRule, saveDiscountRule } from "@/lib/hot-slots/service";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getCurrentMasterProviderId } from "@/lib/master/access";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";
import { parseBody } from "@/lib/validation";
import { hotSlotRuleSchema } from "@/lib/hot-slots/schemas";

export const runtime = "nodejs";

function resolveScope(req: Request): SubscriptionScope {
  const rawScope = new URL(req.url).searchParams.get("scope");
  return rawScope === SubscriptionScope.STUDIO ? SubscriptionScope.STUDIO : SubscriptionScope.MASTER;
}

async function resolveProviderForScope(userId: string, scope: SubscriptionScope): Promise<string> {
  if (scope === SubscriptionScope.STUDIO) {
    const access = await resolveCurrentStudioAccess(userId);
    return access.providerId;
  }
  return getCurrentMasterProviderId(userId);
}

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Необходима авторизация.", "UNAUTHORIZED");

    const scope = resolveScope(req);
    const plan = await getCurrentPlan(user.id, scope);
    if (!plan.features.hotSlots) {
      throw createFeatureGateError("hotSlots", "PREMIUM");
    }

    const providerId = await resolveProviderForScope(user.id, scope);
    const rule = await getOrCreateDiscountRule(providerId);
    return jsonOk({ rule });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/provider/hot-slots/rule failed", {
        requestId: getRequestId(req),
        route: "GET /api/provider/hot-slots/rule",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    const message = appError.code === "VALIDATION_ERROR" ? "Ошибка валидации." : appError.message;
    return jsonFail(appError.status, message, appError.code, appError.details);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Необходима авторизация.", "UNAUTHORIZED");

    const scope = resolveScope(req);
    const plan = await getCurrentPlan(user.id, scope);
    if (!plan.features.hotSlots) {
      throw createFeatureGateError("hotSlots", "PREMIUM");
    }

    const providerId = await resolveProviderForScope(user.id, scope);
    const body = await parseBody(req, hotSlotRuleSchema);
    const { rule } = await saveDiscountRule(providerId, body);
    return jsonOk({ rule });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/provider/hot-slots/rule failed", {
        requestId: getRequestId(req),
        route: "POST /api/provider/hot-slots/rule",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    const message = appError.code === "VALIDATION_ERROR" ? "Ошибка валидации." : appError.message;
    return jsonFail(appError.status, message, appError.code, appError.details);
  }
}
