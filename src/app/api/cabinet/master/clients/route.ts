import { z } from "zod";
import { fail, ok } from "@/lib/api/response";
import { getSessionUser } from "@/lib/auth/session";
import { CRM_CLIENTS_WINDOW_MONTHS } from "@/lib/crm/clients-window";
import { extractClientIp } from "@/lib/http/ip";
import { getMasterWorkProfiles } from "@/lib/master/access";
import { CABINET_NO_STORE_INIT, cabinetReadFailure } from "@/lib/master/cabinet-json";
import { getMasterClientsView } from "@/lib/master/clients-view.service";
import { paginateByOffset, readOffsetCursor } from "@/lib/pagination/offset-cursor";
import { prisma } from "@/lib/prisma";
import { parseQuery } from "@/lib/validation";

export const runtime = "nodejs";

const ROUTE = "GET /api/cabinet/master/clients";

const querySchema = z.object({
  q: z.string().trim().max(80).optional(),
  tab: z.enum(["all", "new", "regular", "vip", "sleeping"]).default("all"),
  sort: z.enum(["recent", "alphabetical", "ltv_desc"]).default("recent"),
  cursor: z.string().trim().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});

/**
 * MOBILE-MASTER-C — клиентская база мастера (`/cabinet/master/clients`,
 * `getMasterClientsView`) постранично. Набор, KPI и счётчики вкладок — как на
 * вебе: клиенты из записей всех рабочих профилей за окно CRM
 * (`windowMonths` месяцев), KPI и `tabCounts` — по всему окну без фильтров,
 * `total` — после `tab` и `q`. Каждый запрос пишет след массового чтения ПДн
 * (`master.clients.list`, RKN-FIX-10) — его пишет сам сервис.
 *
 * Карточка клиента — существующие `GET /api/master/clients/{key}/detail` и
 * `…/card` (ключ `key` — в `encodeURIComponent`).
 */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return fail("Требуется вход в аккаунт.", 401, "UNAUTHORIZED");

    const query = parseQuery(new URL(req.url), querySchema);
    const offset = readOffsetCursor(query.cursor);
    const workProfiles = await getMasterWorkProfiles(user.id);

    const provider = await prisma.provider.findUnique({
      where: { id: workProfiles.personalId },
      select: { timezone: true },
    });
    if (!provider) return fail("Мастер не найден.", 404, "MASTER_NOT_FOUND");

    const search = query.q ?? "";
    const view = await getMasterClientsView({
      providerId: workProfiles.personalId,
      actorUserId: user.id,
      actorIp: extractClientIp(req),
      workProfiles,
      timezone: provider.timezone,
      activeTab: query.tab,
      sort: query.sort,
      search,
    });
    const page = paginateByOffset(view.clients, offset, query.limit);

    return ok(
      {
        windowMonths: CRM_CLIENTS_WINDOW_MONTHS,
        tab: view.activeTab,
        sort: view.sort,
        q: view.search,
        kpi: view.kpi,
        tabCounts: view.tabCounts,
        items: page.items,
        nextCursor: page.nextCursor,
        total: page.total,
      },
      CABINET_NO_STORE_INIT,
    );
  } catch (error) {
    return cabinetReadFailure(req, error, {
      route: ROUTE,
      message: "Не удалось загрузить клиентов. Попробуйте ещё раз.",
    });
  }
}
