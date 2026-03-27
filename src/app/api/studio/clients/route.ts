import { StudioRole } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { SubscriptionScope } from "@prisma/client";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getCurrentPlan } from "@/lib/billing/get-current-plan";
import { canAccessClientCards } from "@/lib/crm/guards";
import { ensureStudioRole } from "@/lib/studio/access";
import { getStudioClients } from "@/lib/studio/clients.service";
import { studioClientsQuerySchema } from "@/lib/studio/schemas";
import { parseQuery } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const query = parseQuery(new URL(req.url), studioClientsQuerySchema);
    await ensureStudioRole({
      studioId: query.studioId,
      userId: user.id,
      allowed: [StudioRole.OWNER, StudioRole.ADMIN],
    });

    const plan = await getCurrentPlan(user.id, SubscriptionScope.STUDIO);
    const data = await getStudioClients({
      studioId: query.studioId,
      sort: query.sort,
      includeCardSummary: canAccessClientCards(plan.features),
      cursor: query.cursor,
      limit: query.limit,
    });
    return jsonOk(data);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/studio/clients failed", {
        requestId: getRequestId(req),
        route: "GET /api/studio/clients",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
