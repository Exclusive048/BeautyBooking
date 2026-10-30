import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { resolveGuestManageScope } from "@/lib/bookings/guest-manage";
import { loadPublicBookingDto } from "@/lib/bookings/public-booking-read";
import { getRequestId, logError } from "@/lib/logging/logger";

export const runtime = "nodejs";

/**
 * PUBLIC-BOOKING-READ-TOKEN (SEC-11b, 2026-10-30) — карточка записи для экрана
 * успеха виджета у ГОСТЯ: право — подписанный токен ссылки «Управлять
 * записью» (`manageUrl` из ответа на создание), сессия не нужна.
 *
 * Токен в пути, а не в query — по той же причине, что у `cancel` / `reschedule`
 * / `review` рядом: query оседает в логах и реферере. Проверка — та же
 * `resolveGuestManageScope`: поддельный, чужого назначения или протухший
 * токен — 404 `GUEST_MANAGE_LINK_INVALID`; запись, клиент которой завёл
 * аккаунт, — 403 «войдите» (её читают уже сессией через `/api/public/bookings/[id]`).
 *
 * Отдаётся запись ИЗ ТОКЕНА — id из запроса здесь не читается вовсе, поэтому
 * токен одной записи другую не откроет.
 */
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    const scope = await resolveGuestManageScope(token);
    const booking = await loadPublicBookingDto(scope.bookingId);
    if (!booking) {
      return jsonFail(404, "Ссылка недействительна или устарела.", "GUEST_MANAGE_LINK_INVALID");
    }
    return jsonOk({ booking });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/public/bookings/manage/[token] failed", {
        requestId: getRequestId(req),
        route: "GET /api/public/bookings/manage/{token}",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code);
  }
}
