import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { resolveScheduleProvider } from "@/lib/schedule/provider-access";
import { listScheduleOverrides } from "@/lib/schedule/unified";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Необходима авторизация.", "UNAUTHORIZED");

    const url = new URL(req.url);
    const providerId = url.searchParams.get("providerId");
    const month = url.searchParams.get("month") ?? "";
    if (!month) {
      return jsonFail(400, "Не указан месяц.", "VALIDATION_ERROR");
    }

    const provider = await resolveScheduleProvider({ userId: user.id, providerId });
    const overrides = await listScheduleOverrides(provider.id, month);
    return jsonOk({ overrides });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/provider/schedule/overrides failed", {
        requestId: getRequestId(req),
        route: "GET /api/provider/schedule/overrides",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
