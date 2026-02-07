import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getCurrentMasterProviderId } from "@/lib/master/access";
import { masterBookingStatusSchema } from "@/lib/master/schemas";
import { updateMasterBookingStatus } from "@/lib/studio/bookings.service";
import { parseBody } from "@/lib/validation";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const runtime = "nodejs";

export async function PATCH(req: Request, ctx: RouteContext) {
  try {
    // AUDIT (HTTP-обвязка смены статуса мастером):
    // - реализовано: endpoint передаёт подтверждение/отклонение в src/lib/studio/bookings.service.
    // - реализовано частично: публично принимает CANCELLED/NO_SHOW, но нормализует их в REJECTED.
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");
    const { id } = await ctx.params;
    if (!id) return jsonFail(400, "Validation error", "VALIDATION_ERROR");

    const body = await parseBody(req, masterBookingStatusSchema);
    const masterId = await getCurrentMasterProviderId(user.id);
    const normalizedStatus = body.status === "CONFIRMED" ? "CONFIRMED" : "REJECTED";
    const result = await updateMasterBookingStatus({
      bookingId: id,
      masterId,
      status: normalizedStatus,
      comment: body.comment,
    });
    return jsonOk(result);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("PATCH /api/master/bookings/[id]/status failed", {
        requestId: getRequestId(req),
        route: "PATCH /api/master/bookings/{id}/status",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

