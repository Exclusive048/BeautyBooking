import { cancelBooking } from "@/lib/bookings/cancelBooking";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/access";
import { requireBookingCancelAccess } from "@/lib/auth/ownership";
import { parseBody } from "@/lib/validation";
import { bookingCancelSchema } from "@/lib/validation/bookings";
import { getRequestId, logError } from "@/lib/logging/logger";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  let userId: string | undefined;
  try {
    const user = await getSessionUser(req);
    userId = user.userId;
    const p = params instanceof Promise ? await params : params;
    const cancellation = await requireBookingCancelAccess(user, p.id);

    const parsed = await parseBody(req, bookingCancelSchema);

    const booking = await cancelBooking({
      bookingId: p.id,
      cancelledBy: cancellation.cancelledBy,
      reason: parsed.reason ?? null,
    });

    return jsonOk({ booking });
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("POST /api/bookings/[id]/cancel failed", {
        requestId,
        route: "POST /api/bookings/{id}/cancel",
        userId,
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
