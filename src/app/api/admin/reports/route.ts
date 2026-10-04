import { z } from "zod";
import { fail, ok } from "@/lib/api/response";
import { toAppError } from "@/lib/api/errors";
import { requireAdminAuth } from "@/lib/auth/admin";
import { logError } from "@/lib/logging/logger";
import { parseQuery } from "@/lib/validation";
import { CONTENT_REPORT_TARGET_TYPES } from "@/lib/moderation/content-reports";
import {
  getAdminContentReportCounts,
  listAdminContentReports,
} from "@/features/admin-cabinet/reports/server/reports.service";

export const runtime = "nodejs";

const querySchema = z.object({
  status: z.enum(["new", "resolved", "dismissed", "all"]).default("new"),
  type: z.enum([...CONTENT_REPORT_TARGET_TYPES, "all"]).default("all"),
  cursor: z.string().trim().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

/**
 * MOBILE-POLISH (App Store 1.2) — очередь жалоб на контент для админ-панели
 * (`/admin/reports` рендерит то же на сервере). `?status=new|resolved|dismissed|all`
 * (по умолчанию — новые, от старых к свежим: срок ответа — 24 часа),
 * `?type=PROVIDER|REVIEW|PORTFOLIO_ITEM|CHAT|MODEL_OFFER`, курсор — `nextCursor`.
 * `counts` — счётчики вкладок, просроченные и открытые жалобы на отзывы
 * (они разбираются в «Отзывах»).
 */
export async function GET(req: Request) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  try {
    const query = parseQuery(new URL(req.url), querySchema);
    const [list, counts] = await Promise.all([
      listAdminContentReports({
        status: query.status,
        type: query.type,
        cursor: query.cursor ?? null,
        pageSize: query.limit,
      }),
      getAdminContentReportCounts(),
    ]);
    return ok({ items: list.items, nextCursor: list.nextCursor, counts });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status < 500) {
      return fail(appError.message, appError.status, appError.code, appError.details);
    }
    logError("GET /api/admin/reports failed", {
      route: "GET /api/admin/reports",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return fail("Не удалось загрузить жалобы. Попробуйте ещё раз.", 500, "INTERNAL_ERROR");
  }
}
