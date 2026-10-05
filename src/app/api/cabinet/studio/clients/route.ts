import { z } from "zod";
import { fail, ok } from "@/lib/api/response";
import { getSessionUser } from "@/lib/auth/session";
import { CRM_CLIENTS_WINDOW_MONTHS } from "@/lib/crm/clients-window";
import { extractClientIp } from "@/lib/http/ip";
import { CABINET_NO_STORE_INIT, cabinetReadFailure } from "@/lib/master/cabinet-json";
import { readOffsetCursor } from "@/lib/pagination/offset-cursor";
import { requireStudioCabinetAdmin } from "@/lib/studio/cabinet-access";
import { toStudioClientJson } from "@/lib/studio/cabinet-catalog-json";
import { parseQuery } from "@/lib/validation";
import { loadStudioClientsPage } from "@/features/studio-cabinet/clients/server/clients-data.service";

export const runtime = "nodejs";

const ROUTE = "GET /api/cabinet/studio/clients";

const querySchema = z.object({
  segment: z.enum(["all", "vip", "regular", "new", "sleeping"]).default("all"),
  q: z.string().trim().max(80).optional(),
  /** Provider мастера студии (основной мастер клиента); `all` — без фильтра. */
  master: z.string().trim().min(1).max(64).optional(),
  cursor: z.string().trim().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});

/**
 * MOBILE-STUDIO-C (G6) — клиентская база студии (`/cabinet/studio/clients`)
 * постранично. Набор, сегменты, KPI и порядок — как на вебе
 * (`loadStudioClientsPage` поверх общего с вебом сбора): клиенты из записей
 * студии за окно CRM (`windowMonths`), KPI и `segmentCounts` — по всей базе
 * без фильтров, `total` — после `segment`/`q`/`master`. Телефон в строке —
 * часть CRM-списка; каждый запрос пишет след `studio.clients.list`.
 */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return fail("Требуется вход в аккаунт.", 401, "UNAUTHORIZED");

    const query = parseQuery(new URL(req.url), querySchema);
    const offset = readOffsetCursor(query.cursor);
    const access = await requireStudioCabinetAdmin(user.id);

    const master = query.master && query.master !== "all" ? query.master : null;
    const search = query.q ?? "";
    const page = await loadStudioClientsPage({
      studioId: access.studioId,
      actorUserId: user.id,
      actorIp: extractClientIp(req),
      segment: query.segment,
      search,
      masterId: master ?? undefined,
      offset,
      limit: query.limit,
    });

    return ok(
      {
        windowMonths: CRM_CLIENTS_WINDOW_MONTHS,
        timezone: page.timezone,
        segment: query.segment,
        q: search,
        master,
        kpi: page.kpis,
        segmentCounts: page.segmentCounts,
        masterOptions: page.masterOptions,
        items: page.items.map(toStudioClientJson),
        nextCursor: page.nextCursor,
        total: page.total,
        totalCount: page.totalCount,
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
