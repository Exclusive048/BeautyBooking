import { z } from "zod";
import { SubscriptionScope } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getCurrentMasterProviderId } from "@/lib/master/access";
import { getMasterClients } from "@/lib/master/clients.service";
import { getCurrentPlan } from "@/lib/billing/get-current-plan";
import { canAccessClientCards } from "@/lib/crm/guards";
import { parseQuery } from "@/lib/validation";

const querySchema = z.object({
  sort: z.enum(["recent", "visits", "alpha"]).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const query = parseQuery(new URL(req.url), querySchema);
    const providerId = await getCurrentMasterProviderId(user.id);
    const plan = await getCurrentPlan(user.id, SubscriptionScope.MASTER);

    const data = await getMasterClients({
      providerId,
      sort: query.sort,
      includeCardSummary: canAccessClientCards(plan.tier),
      cursor: query.cursor,
      limit: query.limit,
    });
    return jsonOk(data);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/master/clients failed", {
        requestId: getRequestId(req),
        route: "GET /api/master/clients",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
