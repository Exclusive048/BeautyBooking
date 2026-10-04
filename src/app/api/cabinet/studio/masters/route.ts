import { z } from "zod";
import { fail, ok } from "@/lib/api/response";
import { getSessionUser } from "@/lib/auth/session";
import { CABINET_NO_STORE_INIT, cabinetReadFailure } from "@/lib/master/cabinet-json";
import { requireStudioCabinetAdmin } from "@/lib/studio/cabinet-access";
import { toStudioMasterListItemJson } from "@/lib/studio/team-cabinet-json";
import { getStudioTeamCapacity, isStudioTeamAtCap } from "@/lib/studio/team-limits";
import { parseQuery } from "@/lib/validation";
import { loadStudioMastersList } from "@/features/studio-cabinet/masters/server/masters-list.service";

export const runtime = "nodejs";

const ROUTE = "GET /api/cabinet/studio/masters";

const querySchema = z.object({
  filter: z.enum(["all", "active", "invited", "disabled"]).default("all"),
  q: z.string().trim().max(80).optional(),
});

/**
 * MOBILE-STUDIO-C (team) — команда студии (`/cabinet/studio/team`,
 * `loadStudioMastersList`): мастера с метриками за 30 дней, статусом
 * (`DISABLED` — пауза в студии) и счётчиками вкладок по всей команде, плюс
 * потолок тарифа (`getStudioTeamCapacity` — то же правило, что у проверки
 * приглашения: тариф владельца, считаются только ACTIVE). Телефонов и почт в
 * списке нет — они в карточке мастера.
 */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return fail("Требуется вход в аккаунт.", 401, "UNAUTHORIZED");

    const access = await requireStudioCabinetAdmin(user.id);
    const query = parseQuery(new URL(req.url), querySchema);
    const search = query.q ?? "";

    const [list, capacity] = await Promise.all([
      loadStudioMastersList({
        studioId: access.studioId,
        currentUserId: user.id,
        filter: query.filter,
        search,
      }),
      getStudioTeamCapacity(access.studioId),
    ]);

    return ok(
      {
        filter: query.filter,
        q: search,
        items: list.items.map(toStudioMasterListItemJson),
        counts: list.counts,
        teamLimit: {
          max: capacity.max,
          activeCount: capacity.activeCount,
          canInvite: !isStudioTeamAtCap(capacity.activeCount, capacity.max),
        },
      },
      CABINET_NO_STORE_INIT,
    );
  } catch (error) {
    return cabinetReadFailure(req, error, {
      route: ROUTE,
      message: "Не удалось загрузить мастеров. Попробуйте ещё раз.",
    });
  }
}
