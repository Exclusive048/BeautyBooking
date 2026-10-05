import { z } from "zod";
import { fail, ok } from "@/lib/api/response";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getClientBooking } from "@/lib/client-cabinet/bookings.service";
import { getRequestId, logError } from "@/lib/logging/logger";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const paramsSchema = z.object({ id: z.string().trim().min(1).max(64) });

const NOT_FOUND_MESSAGE = "Запись не найдена.";

/**
 * MOBILE-CLIENT-01 (G1) — карточка одной записи клиента: push и ссылки
 * приложения ведут на `/bookings/{id}`, а на вебе есть только список. Форма
 * `data.booking` — ровно элемент `GET /api/cabinet/user/bookings` (общий
 * маппер). Сессия — как у списка (`Authorization: Bearer` главнее куки).
 * Чужая, несуществующая и заведомо невозможная по форме запись — один и тот же
 * 404 `BOOKING_NOT_FOUND`: существование чужой брони не раскрывается.
 * Лимит — общий тир прокси `publicApi` по аккаунту, как у списка.
 */
export async function GET(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return fail("Требуется вход в аккаунт.", 401, "UNAUTHORIZED");

    const parsed = paramsSchema.safeParse(await ctx.params);
    if (!parsed.success) return fail(NOT_FOUND_MESSAGE, 404, "BOOKING_NOT_FOUND");

    const booking = await getClientBooking(user.id, parsed.data.id);
    if (!booking) return fail(NOT_FOUND_MESSAGE, 404, "BOOKING_NOT_FOUND");

    return ok({ booking });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status < 500) {
      return fail(appError.message, appError.status, appError.code, appError.details);
    }
    logError("GET /api/cabinet/user/bookings/[id] failed", {
      requestId: getRequestId(req),
      route: "GET /api/cabinet/user/bookings/{id}",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return fail("Не удалось загрузить запись. Попробуйте ещё раз.", 500, "INTERNAL_ERROR");
  }
}
