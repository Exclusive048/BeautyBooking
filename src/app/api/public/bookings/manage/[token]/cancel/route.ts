import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { cancelGuestBooking, resolveGuestManageScope } from "@/lib/bookings/guest-manage";
import { guestManageRateLimitRefusal } from "@/lib/bookings/guest-manage-route";
import { routeRateLimitKey } from "@/lib/rate-limit/keys";
import { getClientIp } from "@/lib/http/ip";
import { getRequestId, logError } from "@/lib/logging/logger";

export const runtime = "nodejs";

/**
 * GUEST-MANAGE-LINK — отмена записи гостем по ссылке «Управлять записью».
 * Право — подписанный токен в пути (`guest-manage.ts`), сессия не нужна.
 * Пакет отменяется целиком; дедлайн отмены — как у клиента в кабинете.
 */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const refusal = await guestManageRateLimitRefusal(routeRateLimitKey(req, "ip", getClientIp(req)));
    if (refusal) return refusal;

    const { token } = await ctx.params;
    const scope = await resolveGuestManageScope(token);
    const result = await cancelGuestBooking(scope);
    return jsonOk({ cancelled: result.cancelledBookingIds.length });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/public/bookings/manage/[token]/cancel failed", {
        requestId: getRequestId(req),
        route: "POST /api/public/bookings/manage/{token}/cancel",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code);
  }
}
