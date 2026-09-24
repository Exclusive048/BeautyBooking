import { z } from "zod";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { rescheduleGuestBooking, resolveGuestManageScope } from "@/lib/bookings/guest-manage";
import { guestManageRateLimitRefusal } from "@/lib/bookings/guest-manage-route";
import { getClientIp } from "@/lib/http/ip";
import { getRequestId, logError } from "@/lib/logging/logger";
import { ensureStartBeforeEnd, parseISOToUTC } from "@/lib/time";
import { parseBody } from "@/lib/validation";
import { bookingRescheduleSchema } from "@/lib/validation/bookings";

export const runtime = "nodejs";

// `bookingId` — какую услугу пакета переносим; у одиночной записи — она сама.
const bodySchema = bookingRescheduleSchema.and(z.object({ bookingId: z.string().trim().min(1).max(64) }));

/**
 * GUEST-MANAGE-LINK — запрос переноса гостем по ссылке «Управлять записью».
 * Тот же путь, что у клиента в кабинете (`rescheduleBooking`, сторона CLIENT):
 * новое время вступает, когда его подтвердит мастер.
 */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const refusal = await guestManageRateLimitRefusal(`rate:guestManage:ip:${getClientIp(req)}`);
    if (refusal) return refusal;

    const { token } = await ctx.params;
    const scope = await resolveGuestManageScope(token);
    const body = await parseBody(req, bodySchema);
    const startAtUtc = parseISOToUTC(body.startAtUtc, "startAtUtc");
    const endAtUtc = parseISOToUTC(body.endAtUtc, "endAtUtc");
    ensureStartBeforeEnd(startAtUtc, endAtUtc);

    const booking = await rescheduleGuestBooking(scope, {
      bookingId: body.bookingId,
      startAtUtc,
      endAtUtc,
      slotLabel: body.slotLabel,
    });
    return jsonOk({ booking });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/public/bookings/manage/[token]/reschedule failed", {
        requestId: getRequestId(req),
        route: "POST /api/public/bookings/manage/{token}/reschedule",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code);
  }
}
