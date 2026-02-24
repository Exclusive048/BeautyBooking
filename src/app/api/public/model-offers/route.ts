import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";
import { publicModelOffersQuerySchema } from "@/lib/model-offers/schemas";
import { listPublicModelOffers } from "@/lib/model-offers/public.service";
import { parseQuery } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const query = parseQuery(new URL(req.url), publicModelOffersQuerySchema);
    const result = await listPublicModelOffers(query);
    return jsonOk(result);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/public/model-offers failed", {
        requestId: getRequestId(req),
        route: "GET /api/public/model-offers",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
