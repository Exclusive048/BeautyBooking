import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getPublicServiceBookingConfig } from "@/lib/services/booking-config";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const runtime = "nodejs";

export async function GET(req: Request, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    if (!id) return jsonFail(400, "Validation error", "VALIDATION_ERROR");

    const config = await getPublicServiceBookingConfig(id);
    return jsonOk(config);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/public/services/[id]/booking-config failed", {
        requestId: getRequestId(req),
        route: "GET /api/public/services/{id}/booking-config",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
