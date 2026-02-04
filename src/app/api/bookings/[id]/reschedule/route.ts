import { rescheduleBooking } from "@/lib/bookings/usecases";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { resolveErrorCode, toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/access";
import { requireBookingRescheduleAccess } from "@/lib/auth/ownership";
import { parseBody } from "@/lib/validation";
import { bookingRescheduleSchema } from "@/lib/validation/bookings";
import { ensureStartBeforeEnd, parseISOToUTC } from "@/lib/time";
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
    await requireBookingRescheduleAccess(user, p.id);

    const parsed = await parseBody(req, bookingRescheduleSchema);

    const startAtUtc = parseISOToUTC(parsed.startAtUtc, "startAtUtc");
    const endAtUtc = parseISOToUTC(parsed.endAtUtc, "endAtUtc");
    ensureStartBeforeEnd(startAtUtc, endAtUtc);

    const result = await rescheduleBooking({
      bookingId: p.id,
      actorUserId: user.userId,
      startAtUtc,
      endAtUtc,
      slotLabel: parsed.slotLabel,
      silentMode: parsed.silentMode,
    });
    if (!result.ok) {
      return jsonFail(result.status, result.message, resolveErrorCode(result.code, "INTERNAL_ERROR"));
    }

    return jsonOk({ booking: result.data });
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("POST /api/bookings/[id]/reschedule failed", {
        requestId,
        route: "POST /api/bookings/{id}/reschedule",
        userId,
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
