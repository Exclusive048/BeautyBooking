import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getCurrentMasterProviderId } from "@/lib/master/access";
import { getMasterClientDetail } from "@/lib/master/clients-view.service";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ clientKey: string }>;
};

export const runtime = "nodejs";

/**
 * `GET /api/master/clients/[clientKey]/detail` — full `ClientDetailView`
 * payload for the right-hand pane. Introduced in 27a-FIX-URL together
 * with the URL cleanup: the page no longer carries `?id=`, so the detail
 * pane fetches data on click instead of being server-rendered with the
 * list.
 *
 * Distinct from the legacy `/card` endpoint (notes/tags/photos only):
 * this returns the enriched view (contact, source, stats, statuses,
 * recent visits) used by the redesigned CRM page.
 */
export async function GET(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const params = await ctx.params;
    const clientKey = params.clientKey ? decodeURIComponent(params.clientKey) : "";
    if (!clientKey) return jsonFail(400, "Validation error", "VALIDATION_ERROR");

    const providerId = await getCurrentMasterProviderId(user.id);
    const provider = await prisma.provider.findUnique({
      where: { id: providerId },
      select: { timezone: true },
    });
    if (!provider) return jsonFail(404, "Master not found", "MASTER_NOT_FOUND");

    const detail = await getMasterClientDetail({
      providerId,
      timezone: provider.timezone,
      clientKey,
    });
    if (!detail) return jsonFail(404, "Client not found", "NOT_FOUND");

    return jsonOk(detail);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/master/clients/[clientKey]/detail failed", {
        requestId: getRequestId(req),
        route: "GET /api/master/clients/{clientKey}/detail",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
