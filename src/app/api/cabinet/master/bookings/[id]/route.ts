import { z } from "zod";
import { fail, ok } from "@/lib/api/response";
import { getSessionUser } from "@/lib/auth/session";
import { getMasterWorkProfiles } from "@/lib/master/access";
import { getMasterBookingDetail } from "@/lib/master/booking-items.service";
import { CABINET_NO_STORE_INIT, cabinetReadFailure } from "@/lib/master/cabinet-json";

export const runtime = "nodejs";

const ROUTE = "GET /api/cabinet/master/bookings/{id}";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const paramsSchema = z.object({ id: z.string().trim().min(1).max(64) });

const NOT_FOUND_MESSAGE = "Запись не найдена.";

/**
 * MOBILE-MASTER-C — карточка записи для мастера (цель push `/master/bookings/{id}`
 * и тапа по записи в любом списке). На вебе отдельной карточки нет — канбан и
 * меню расписания показывают поля прямо в плитке; здесь то же и больше: клиент
 * (телефон, ключ CRM-карточки, токен истории), комментарий и ответы клиента,
 * переносы и отмена, отзыв и разрешённые действия (`actions`, правило
 * `bookings/master-actions.ts`).
 *
 * Запись ищется только среди тех, что мастер выполняет (все рабочие профили);
 * чужая, несуществующая и невозможная по форме — один 404 `BOOKING_NOT_FOUND`.
 * Не мастер — 403 `FORBIDDEN`.
 */
export async function GET(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return fail("Требуется вход в аккаунт.", 401, "UNAUTHORIZED");

    const workProfiles = await getMasterWorkProfiles(user.id);

    const parsed = paramsSchema.safeParse(await ctx.params);
    if (!parsed.success) return fail(NOT_FOUND_MESSAGE, 404, "BOOKING_NOT_FOUND");

    const booking = await getMasterBookingDetail({ bookingId: parsed.data.id, workProfiles });
    if (!booking) return fail(NOT_FOUND_MESSAGE, 404, "BOOKING_NOT_FOUND");

    return ok({ booking }, CABINET_NO_STORE_INIT);
  } catch (error) {
    return cabinetReadFailure(req, error, {
      route: ROUTE,
      message: "Не удалось загрузить запись. Попробуйте ещё раз.",
    });
  }
}
