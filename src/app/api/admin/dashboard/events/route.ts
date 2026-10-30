import { z } from "zod";
import { NextRequest } from "next/server";
import { requireAdminAuth } from "@/lib/auth/admin";
import { fail, ok } from "@/lib/api/response";
import { getClientIp } from "@/lib/http/ip";
import { logError } from "@/lib/logging/logger";
import * as UI_TEXT from "@/lib/ui/text";
import {
  ADMIN_EVENTS_POLL_WINDOW_MS,
  parseAdminEventCategory,
} from "@/features/admin-cabinet/dashboard/lib/event-categories";
import {
  decodeAdminEventsCursor,
  getAdminEvents,
} from "@/features/admin-cabinet/dashboard/server/events.service";

export const dynamic = "force-dynamic";

const INVALID_QUERY = "Некорректные параметры запроса.";

const querySchema = z.object({
  /** Опрос новых: только события не раньше этого момента (unix ms). Не
   *  старше `ADMIN_EVENTS_POLL_WINDOW_MS` и не вместе с курсором — см. ниже. */
  since: z.coerce.number().int().positive().optional(),
  /** ADMIN-EVENTS-02: «Показать ещё» — курсор из `nextCursor` прошлой страницы. */
  cursor: z.string().trim().min(1).max(200).optional(),
  /** Раздел истории: all | bookings | users | billing | reviews | admin. */
  category: z.string().trim().max(32).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return fail(INVALID_QUERY, 400, "INVALID_QUERY");
  }
  // ADMIN-EVENTS-SINCE-TRAIL (D-01). Опрос новых (`since`) следа чтения ПДн не
  // пишет — иначе живая лента раз в 30 с давала бы до 120 событий в час, а
  // детектор аномалий (`pd-access-anomaly.ts`) считает у админа больше 60
  // аномалией. Бесшумность допустима, только пока опрос СТРУКТУРНО узкий:
  // прежде `since=1&cursor=…` листал всю историю (имена, телефоны, почты)
  // страница за страницей, и ни одна страница следа не оставляла. Поэтому
  // здесь, в роуте: `since` — только без курсора и только за последний час.
  // В сервисе этой проверки нет намеренно — выгрузка законно зовёт его с
  // `sinceMs` + `after` за 7–90 дней и пишет свой след `admin.events.export`.
  const since = parsed.data.since;
  if (since !== undefined) {
    if (parsed.data.cursor) {
      return fail(INVALID_QUERY, 400, "INVALID_QUERY");
    }
    if (since < Date.now() - ADMIN_EVENTS_POLL_WINDOW_MS) {
      return fail(INVALID_QUERY, 400, "INVALID_QUERY");
    }
  }
  const after = parsed.data.cursor ? decodeAdminEventsCursor(parsed.data.cursor) : null;
  if (parsed.data.cursor && !after) {
    return fail(INVALID_QUERY, 400, "INVALID_QUERY");
  }

  try {
    const data = await getAdminEvents({
      limit: parsed.data.limit,
      sinceMs: since,
      after,
      category: parseAdminEventCategory(parsed.data.category),
      actor: { userId: auth.user.id, ip: getClientIp(req) },
    });
    return ok(data);
  } catch (error) {
    logError("admin.dashboard.events failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return fail(UI_TEXT.adminPanel.dashboard.errors.loadEvents, 500, "ADMIN_EVENTS_FAILED");
  }
}
