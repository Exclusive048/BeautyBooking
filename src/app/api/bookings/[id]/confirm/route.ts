import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/access";
import { requireBookingConfirmAccess } from "@/lib/auth/ownership";
import { confirmBooking } from "@/lib/bookings/confirmBooking";
import { getRequestId, logError } from "@/lib/logging/logger";
import { loadBookingWithRelations, notifyBookingConfirmed } from "@/lib/notifications/booking-notifications";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  let userId: string | undefined;
  try {
    const user = await getSessionUser(_req);
    userId = user.userId;
    const p = params instanceof Promise ? await params : params;
    const access = await requireBookingConfirmAccess(user, p.id);

    const booking = await confirmBooking(p.id, access.actor);
    if (access.actor === "MASTER") {
      try {
        const fullBooking = await loadBookingWithRelations(booking.id);
        if (fullBooking) {
          await notifyBookingConfirmed(fullBooking);
        }
      } catch (error) {
        logError("POST /api/bookings/[id]/confirm notification failed", {
          requestId: getRequestId(_req),
          route: "POST /api/bookings/{id}/confirm",
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return jsonOk({ booking });
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(_req);
    if (appError.status >= 500) {
      logError("POST /api/bookings/[id]/confirm failed", {
        requestId,
        route: "POST /api/bookings/{id}/confirm",
        userId,
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
