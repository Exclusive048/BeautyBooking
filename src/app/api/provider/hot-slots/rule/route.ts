import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { parseBody } from "@/lib/validation";
import { hotSlotRuleSchema } from "@/lib/hot-slots/schemas";
import { getCurrentMasterProviderId } from "@/lib/master/access";
import { getOrCreateDiscountRule, saveDiscountRule } from "@/lib/hot-slots/service";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Необходима авторизация.", "UNAUTHORIZED");

    const providerId = await getCurrentMasterProviderId(user.id);
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

    const providerId = await getCurrentMasterProviderId(user.id);
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
