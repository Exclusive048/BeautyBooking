import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { getSessionUser } from "@/lib/auth/session";
import { createPaletteDay } from "@/lib/schedule/calendar";
import { buildScheduleSnapshot } from "@/lib/schedule/editor";
import { paletteDaySchema } from "@/lib/schedule/palette-request";
import { resolveScheduleActor } from "@/lib/schedule/schedule-actor";
import { assertCanEditSchedulePlan, failScheduleRoute } from "@/lib/schedule/schedule-route";
import { parseBody } from "@/lib/validation";

/**
 * SCHEDULE-PATTERNS-01 (этап 3) — палитра рабочих дней мастера («Утро 9–15»,
 * «Полный день»). POST — новый рабочий день. Ответ: id дня и снапшот настроек
 * (палитра читается из него). Доступ — как у календаря.
 */
export async function POST(req: Request) {
  const route = "POST /api/cabinet/master/schedule/palette";
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Требуется вход в аккаунт.", "UNAUTHORIZED");

    const actor = await resolveScheduleActor(req, user.id);
    assertCanEditSchedulePlan(actor);
    const body = await parseBody(req, paletteDaySchema);

    const templateId = await createPaletteDay(actor.providerId, {
      ...body,
      breaks: body.breaks.map((item) => ({ ...item, title: item.title ?? null })),
    });
    return jsonOk({ templateId, snapshot: await buildScheduleSnapshot(actor.providerId) });
  } catch (error) {
    return failScheduleRoute(req, route, error);
  }
}
