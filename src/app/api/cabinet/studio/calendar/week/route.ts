import { z } from "zod";
import { AppError } from "@/lib/api/errors";
import { fail, ok } from "@/lib/api/response";
import { getSessionUser } from "@/lib/auth/session";
import { CABINET_NO_STORE_INIT, cabinetReadFailure } from "@/lib/master/cabinet-json";
import { addDaysToDateKey, isDateKey } from "@/lib/schedule/dateKey";
import { requireStudioCabinetAdmin } from "@/lib/studio/cabinet-access";
import { parseQuery } from "@/lib/validation";
import { loadStudioScheduleWeek } from "@/features/studio-cabinet/schedule/server/calendar-week.service";

export const runtime = "nodejs";

const ROUTE = "GET /api/cabinet/studio/calendar/week";

const querySchema = z.object({
  date: z
    .string()
    .trim()
    .refine((value) => isDateKey(value) && addDaysToDateKey(value, 0) === value, "Укажите дату в формате ГГГГ-ММ-ДД.")
    .optional(),
});

/**
 * MOBILE-STUDIO-C (ops) — неделя календаря студии (понедельник–воскресенье,
 * в которую входит `date`, по умолчанию — текущая неделя салона): загрузка
 * «мастер × день» по настоящему графику мастеров (`loadDayPlans`), а не по
 * эвристике веб-недели «5 записей = 100%». Только владелец / администратор.
 */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return fail("Требуется вход в аккаунт.", 401, "UNAUTHORIZED");

    const access = await requireStudioCabinetAdmin(user.id);
    const query = parseQuery(new URL(req.url), querySchema);
    const week = await loadStudioScheduleWeek({ studioId: access.studioId, dateKey: query.date });
    if (!week) throw new AppError("Студия не найдена.", 404, "STUDIO_NOT_FOUND");

    return ok(week, CABINET_NO_STORE_INIT);
  } catch (error) {
    return cabinetReadFailure(req, error, {
      route: ROUTE,
      message: "Не удалось загрузить расписание. Попробуйте ещё раз.",
    });
  }
}
