import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { getSessionUser } from "@/lib/auth/session";
import { deletePaletteDay, updatePaletteDay } from "@/lib/schedule/calendar";
import { buildScheduleSnapshot } from "@/lib/schedule/editor";
import { paletteDayPatchSchema } from "@/lib/schedule/palette-request";
import { resolveScheduleActor } from "@/lib/schedule/schedule-actor";
import { assertCanEditSchedulePlan, failScheduleRoute } from "@/lib/schedule/schedule-route";
import { parseBody } from "@/lib/validation";

/**
 * SCHEDULE-PATTERNS-01 (этап 3) — один рабочий день палитры.
 *
 *   PATCH  — имя и цвет. Часы не меняются: на день ссылаются прошедшие дни,
 *            другие часы — это новый рабочий день и перекраска.
 *   DELETE — удалить, если день не стоит ни в графике (в том числе прошлом),
 *            ни в неделе, ни в будущем дне календаря (иначе 409).
 */

type Ctx = { params: Promise<{ templateId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const route = "PATCH /api/cabinet/master/schedule/palette/[templateId]";
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Требуется вход в аккаунт.", "UNAUTHORIZED");

    const { templateId } = await ctx.params;
    const actor = await resolveScheduleActor(req, user.id);
    assertCanEditSchedulePlan(actor);
    const body = await parseBody(req, paletteDayPatchSchema);

    await updatePaletteDay(actor.providerId, templateId, body);
    return jsonOk({ snapshot: await buildScheduleSnapshot(actor.providerId) });
  } catch (error) {
    return failScheduleRoute(req, route, error);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const route = "DELETE /api/cabinet/master/schedule/palette/[templateId]";
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Требуется вход в аккаунт.", "UNAUTHORIZED");

    const { templateId } = await ctx.params;
    const actor = await resolveScheduleActor(req, user.id);
    assertCanEditSchedulePlan(actor);

    await deletePaletteDay(actor.providerId, templateId);
    return jsonOk({ snapshot: await buildScheduleSnapshot(actor.providerId) });
  } catch (error) {
    return failScheduleRoute(req, route, error);
  }
}
