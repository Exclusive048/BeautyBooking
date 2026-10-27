import { z } from "zod";
import { NextRequest } from "next/server";
import { PdAccessActorType } from "@prisma/client";
import { hasAdminRole } from "@/lib/auth/guards";
import { getSessionUser } from "@/lib/auth/session";
import { nextRedirect } from "@/lib/http/origin";
import { buildFilterFingerprint, recordPdAccess } from "@/lib/audit/pd-access";
import { env } from "@/lib/env";
import { buildXlsx, XLSX_CONTENT_TYPE } from "@/lib/export/xlsx";
import { getClientIp } from "@/lib/http/ip";
import { logError } from "@/lib/logging/logger";
import * as UI_TEXT from "@/lib/ui/text";
import { UI_FMT } from "@/lib/ui/fmt";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import { parseAdminEventCategory } from "@/features/admin-cabinet/dashboard/lib/event-categories";
import {
  ADMIN_EVENTS_EXPORT_DAYS,
  collectAdminEventsForExport,
  formatAdminEventPerson,
} from "@/features/admin-cabinet/dashboard/server/events.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const T = UI_TEXT.adminPanel.dashboard.feed;

const querySchema = z.object({
  days: z.coerce
    .number()
    .int()
    .refine((value): value is (typeof ADMIN_EVENTS_EXPORT_DAYS)[number] =>
      (ADMIN_EVENTS_EXPORT_DAYS as readonly number[]).includes(value),
    )
    .default(30),
  category: z.string().trim().max(32).optional(),
});

const EVENTS_PAGE = "/admin/events";

/** Отказ — навигация обратно на «Историю событий» с ключом исхода (FIX-B18): сюда
 *  браузер приходит по ссылке, JSON в окне был бы тупиком. */
function backToEvents(req: NextRequest, outcome: "forbidden" | "invalid" | "failed") {
  return nextRedirect(req, `${EVENTS_PAGE}?eventsExport=${outcome}`, 303);
}

/**
 * ADMIN-EVENTS-EXPORT — «История событий» в .xlsx за 7 / 30 / 90 дней; раздел —
 * тот же, что выбран на странице (ADMIN-EVENTS-02).
 * Время в файле — по Москве (пояс платформы, `DEFAULT_TIMEZONE`), и это
 * сказано в заголовке колонки (rule 17): у файла нет зрителя, чей пояс брать.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return nextRedirect(req, `/login?next=${encodeURIComponent(EVENTS_PAGE)}`, 303);
  }
  if (!hasAdminRole(user)) return backToEvents(req, "forbidden");

  const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return backToEvents(req, "invalid");
  const days = parsed.data.days as (typeof ADMIN_EVENTS_EXPORT_DAYS)[number];
  const category = parseAdminEventCategory(parsed.data.category);

  try {
    const now = new Date();
    const { items } = await collectAdminEventsForExport(days, category, now);
    const timeZone = env.DEFAULT_TIMEZONE;
    const file = buildXlsx({
      name: T.exportSheetName,
      columns: [
        { header: T.exportTimeColumn, width: 18 },
        { header: T.columns.event, width: 30 },
        { header: T.columns.actor, width: 30 },
        { header: T.columns.subject, width: 30 },
        { header: T.columns.details, width: 60 },
        { header: T.columns.amount, width: 16 },
      ],
      rows: items.map((item) => [
        UI_FMT.date(item.timeMs, "dateTimeNumeric", { timeZone }),
        item.action,
        formatAdminEventPerson(item.actor),
        formatAdminEventPerson(item.subject),
        item.details.join("; "),
        item.amountText,
      ]),
    });

    // RKN-FIX-10: в файле — полные имена клиентов и мастеров; выгрузка —
    // массовое чтение. Значение раздела в след не пишется — только его наличие.
    await recordPdAccess({
      surface: "admin.events.export",
      actorType: PdAccessActorType.ADMIN,
      actorUserId: user.id,
      entityType: "AdminEvent",
      rowCount: items.length,
      filterFingerprint: buildFilterFingerprint({ days: true, category: category !== "all" }, { limit: days }),
      ipAddress: getClientIp(req),
    });

    const fileName = T.exportFileName(days, toLocalDateKey(now, timeZone));
    return new Response(new Uint8Array(file), {
      status: 200,
      headers: {
        "Content-Type": XLSX_CONTENT_TYPE,
        "Content-Disposition": `attachment; filename="events-${days}d.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    logError("admin.dashboard.events.export failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return backToEvents(req, "failed");
  }
}
