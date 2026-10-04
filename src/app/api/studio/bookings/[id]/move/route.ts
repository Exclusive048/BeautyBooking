import { StudioRole } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { ensureStudioRole } from "@/lib/studio/access";
import { moveStudioBooking } from "@/lib/studio/bookings.service";
import { moveStudioBookingSchema } from "@/lib/studio/schemas";
import { parseBody } from "@/lib/validation";
import {
  loadBookingWithRelations,
  notifyStudioBookingMoved,
} from "@/lib/notifications/booking-notifications";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const runtime = "nodejs";

export async function PATCH(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Требуется вход в аккаунт.", "UNAUTHORIZED");
    const { id } = await ctx.params;
    if (!id) return jsonFail(400, "Проверьте правильность заполнения полей.", "VALIDATION_ERROR");

    const body = await parseBody(req, moveStudioBookingSchema);
    await ensureStudioRole({
      studioId: body.studioId,
      userId: user.id,
      allowed: [StudioRole.OWNER, StudioRole.ADMIN],
    });

    const result = await moveStudioBooking({
      studioId: body.studioId,
      bookingId: id,
      targetMasterId: body.targetMasterId,
      targetStartAt: new Date(body.targetStartAt),
      strategy: body.strategy,
      pricing: body.pricing,
    });
    // STUDIO-MOVE-NOTIFY-01: после коммита; сбой рассылки перенос не откатывает.
    try {
      const fullBooking = await loadBookingWithRelations(result.id);
      if (fullBooking) await notifyStudioBookingMoved(fullBooking, result, { actorUserId: user.id });
    } catch (error) {
      logError("PATCH /api/studio/bookings/[id]/move notification failed", {
        requestId: getRequestId(req),
        route: "PATCH /api/studio/bookings/{id}/move",
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return jsonOk({ id: result.id });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("PATCH /api/studio/bookings/[id]/move failed", {
        requestId: getRequestId(req),
        route: "PATCH /api/studio/bookings/{id}/move",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

