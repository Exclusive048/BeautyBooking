import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { SubscriptionScope } from "@prisma/client";
import { getCurrentPlan } from "@/lib/billing/get-current-plan";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const { searchParams } = new URL(req.url);
    const rawScope = searchParams.get("scope");
    const scope =
      rawScope === SubscriptionScope.MASTER || rawScope === SubscriptionScope.STUDIO
        ? rawScope
        : undefined;
    const plan = await getCurrentPlan(user.id, scope);
    return jsonOk(plan, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/me/plan failed", {
        requestId: getRequestId(req),
        route: "GET /api/me/plan",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
