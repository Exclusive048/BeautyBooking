import { z } from "zod";
import { AppError } from "@/lib/api/errors";
import { fail, ok } from "@/lib/api/response";
import { getSessionUser } from "@/lib/auth/session";
import { CABINET_NO_STORE_INIT, cabinetReadFailure } from "@/lib/master/cabinet-json";
import { addDaysToDateKey, isDateKey } from "@/lib/schedule/dateKey";
import { requireStudioCabinetAdmin } from "@/lib/studio/cabinet-access";
import { parseQuery } from "@/lib/validation";
import { toStudioCalendarDayJson } from "@/features/studio-cabinet/schedule/server/calendar-json";
import { loadStudioScheduleDay } from "@/features/studio-cabinet/schedule/server/schedule-data.service";

export const runtime = "nodejs";

const ROUTE = "GET /api/cabinet/studio/calendar/day";

const querySchema = z.object({
  date: z
    .string()
    .trim()
    // Ключ обязан быть настоящей датой: «2026-02-31» `Date` молча превратил бы в 3 марта.
    .refine((value) => isDateKey(value) && addDaysToDateKey(value, 0) === value, "Укажите дату в формате ГГГГ-ММ-ДД.")
    .optional(),
});

/**
 * MOBILE-STUDIO-C (ops) — день календаря студии (`/cabinet/studio/calendar`,
 * сборка дня веба `buildDayData` + `computeKpis`): колонки мастеров с часами
 * из плана дня движка, записи студии с действиями, личная занятость мастеров,
 * блокировки студии, окно сетки и KPI дня. `date` — дата салона, без неё —
 * сегодня. Только владелец / администратор студии.
 */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return fail("Требуется вход в аккаунт.", 401, "UNAUTHORIZED");

    const access = await requireStudioCabinetAdmin(user.id);
    const query = parseQuery(new URL(req.url), querySchema);
    const now = new Date();
    const loaded = await loadStudioScheduleDay({ studioId: access.studioId, dateKey: query.date, now });
    if (!loaded) throw new AppError("Студия не найдена.", 404, "STUDIO_NOT_FOUND");

    return ok(toStudioCalendarDayJson({ ...loaded, now }), CABINET_NO_STORE_INIT);
  } catch (error) {
    return cabinetReadFailure(req, error, {
      route: ROUTE,
      message: "Не удалось загрузить расписание. Попробуйте ещё раз.",
    });
  }
}
