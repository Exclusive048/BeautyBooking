import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { parseBody } from "@/lib/validation";
import { serviceBookingConfigSchema } from "@/lib/master/schemas";
import { getMasterServiceBookingConfig, updateServiceBookingConfig } from "@/lib/services/booking-config";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const runtime = "nodejs";

export async function GET(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");
    const { id } = await ctx.params;
    if (!id) return jsonFail(400, "Validation error", "VALIDATION_ERROR");

    const config = await getMasterServiceBookingConfig({ serviceId: id, userId: user.id });
    return jsonOk(config);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/master/services/[id]/booking-config failed", {
        requestId: getRequestId(req),
        route: "GET /api/master/services/{id}/booking-config",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

export async function PUT(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");
    const { id } = await ctx.params;
    if (!id) return jsonFail(400, "Validation error", "VALIDATION_ERROR");

    const body = await parseBody(req, serviceBookingConfigSchema);
    const config = await updateServiceBookingConfig({
      serviceId: id,
      userId: user.id,
      requiresReferencePhoto: body.requiresReferencePhoto,
      questions: body.questions,
    });
    return jsonOk(config);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("PUT /api/master/services/[id]/booking-config failed", {
        requestId: getRequestId(req),
        route: "PUT /api/master/services/{id}/booking-config",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
