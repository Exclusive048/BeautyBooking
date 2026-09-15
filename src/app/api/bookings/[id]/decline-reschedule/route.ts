import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/access";
import { requireBookingConfirmAccess } from "@/lib/auth/ownership";
import { declineClientRescheduleRequest } from "@/lib/bookings/decline-reschedule";
import { getRequestId, logError } from "@/lib/logging/logger";
import {
  loadBookingWithRelations,
  notifyRescheduleAnswered,
  notifyRescheduleDeclinedByMaster,
} from "@/lib/notifications/booking-notifications";

/**
 * FIX-R2-06-A — decline a client-proposed reschedule (two-sided approval).
 * Counterpart of `POST /api/bookings/[id]/confirm` (accept). Auth via the same
 * `requireBookingConfirmAccess`, which admits the solo master AND a studio admin
 * (→ `actor: "MASTER"`) — giving the studio path parity with the solo master.
 * The booking reverts to its original time. RESCHEDULE-CLIENT-APPROVAL: the
 * other side is told the OLD time stands — «Запись отклонена» was wrong here,
 * the booking is still on. The client declining a master-proposed move notifies
 * the provider side the same way.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  let userId: string | undefined;
  try {
    const user = await getSessionUser(_req);
    userId = user.userId;
    const p = params instanceof Promise ? await params : params;
    const access = await requireBookingConfirmAccess(user, p.id);

    const booking = await declineClientRescheduleRequest(p.id, access.actor);
    try {
      const fullBooking = await loadBookingWithRelations(booking.id);
      if (fullBooking) {
        if (access.actor === "CLIENT") {
          await notifyRescheduleAnswered(fullBooking, "declined");
        } else {
          await notifyRescheduleDeclinedByMaster(fullBooking);
        }
      }
    } catch (error) {
      logError("POST /api/bookings/[id]/decline-reschedule notification failed", {
        requestId: getRequestId(_req),
        route: "POST /api/bookings/{id}/decline-reschedule",
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return jsonOk({ booking });
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(_req);
    if (appError.status >= 500) {
      logError("POST /api/bookings/[id]/decline-reschedule failed", {
        requestId,
        route: "POST /api/bookings/{id}/decline-reschedule",
        userId,
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
