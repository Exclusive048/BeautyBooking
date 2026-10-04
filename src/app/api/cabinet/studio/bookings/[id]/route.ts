import { z } from "zod";
import { AppError } from "@/lib/api/errors";
import { fail, ok } from "@/lib/api/response";
import { getSessionUser } from "@/lib/auth/session";
import { CABINET_NO_STORE_INIT, cabinetReadFailure } from "@/lib/master/cabinet-json";
import { requireStudioCabinetAdmin } from "@/lib/studio/cabinet-access";
import { getStudioBookingDetail } from "@/features/studio-cabinet/bookings/server/booking-detail.service";

export const runtime = "nodejs";

const ROUTE = "GET /api/cabinet/studio/bookings/{id}";

const paramsSchema = z.object({ id: z.string().trim().min(1).max(64) });

const NOT_FOUND = () => new AppError("Запись не найдена.", 404, "BOOKING_NOT_FOUND");

/**
 * MOBILE-STUDIO-C (ops) — карточка записи студии (цель пуша
 * `/studio/bookings/{id}`): элемент журнала плюс телефон и ключ CRM клиента,
 * комментарий, заметка студии, ответы на вопросы, история переносов и отмены,
 * отзыв. Личная запись мастера, чужая, несуществующая и битый id — одинаковый
 * 404 (существование чужой записи не раскрывается). Только владелец /
 * администратор студии.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();
    if (!user) return fail("Требуется вход в аккаунт.", 401, "UNAUTHORIZED");

    const access = await requireStudioCabinetAdmin(user.id);
    const params = paramsSchema.safeParse(await ctx.params);
    if (!params.success) throw NOT_FOUND();

    const booking = await getStudioBookingDetail({
      studioId: access.studioId,
      studioProviderId: access.providerId,
      bookingId: params.data.id,
    });
    if (!booking) throw NOT_FOUND();

    return ok({ studioId: access.studioId, timezone: access.timezone, booking }, CABINET_NO_STORE_INIT);
  } catch (error) {
    return cabinetReadFailure(req, error, {
      route: ROUTE,
      message: "Не удалось загрузить запись. Попробуйте ещё раз.",
    });
  }
}
