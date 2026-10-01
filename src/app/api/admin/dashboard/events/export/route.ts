import { z } from "zod";
import { NextRequest } from "next/server";
import { PdAccessActorType } from "@prisma/client";
import { requireAdminAuth } from "@/lib/auth/admin";
import { fail } from "@/lib/api/response";
import { buildFilterFingerprint, recordPdAccess } from "@/lib/audit/pd-access";
import { env } from "@/lib/env";
import { buildXlsx, XLSX_CONTENT_TYPE } from "@/lib/export/xlsx";
import { getClientIp } from "@/lib/http/ip";
import { logError } from "@/lib/logging/logger";
import * as UI_TEXT from "@/lib/ui/text";
import { UI_FMT } from "@/lib/ui/fmt";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import { adminEventColumns } from "@/features/admin-cabinet/dashboard/lib/event-columns";
import {
  ADMIN_EVENTS_EXPORT_DAYS,
  collectAdminEventsForExport,
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
});

/**
 * ADMIN-EVENTS-EXPORT — «История событий» в .xlsx за 7 / 30 / 90 дней.
 * Время в файле — по Москве (пояс платформы, `DEFAULT_TIMEZONE`), и это
 * сказано в заголовке колонки (rule 17): у файла нет зрителя, чей пояс брать.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return fail("Некорректные параметры запроса.", 400, "INVALID_QUERY");
  }
  const days = parsed.data.days as (typeof ADMIN_EVENTS_EXPORT_DAYS)[number];

  try {
    const now = new Date();
    const { items } = await collectAdminEventsForExport(days, now);
    const timeZone = env.DEFAULT_TIMEZONE;
    const file = buildXlsx({
      name: T.exportSheetName,
      columns: [
        { header: T.exportTimeColumn, width: 18 },
        { header: T.columns.type, width: 22 },
        { header: T.columns.description, width: 40 },
        { header: T.columns.detail, width: 32 },
        { header: T.columns.amount, width: 16 },
      ],
      rows: items.map((item) => {
        const columns = adminEventColumns(item);
        return [
          UI_FMT.date(item.timeMs, "dateTimeNumeric", { timeZone }),
          columns.typeLabel,
          columns.description,
          columns.detail,
          item.amountText,
        ];
      }),
    });

    // RKN-FIX-10: в файле — имена с маской фамилии; выгрузка — массовое чтение.
    await recordPdAccess({
      surface: "admin.events.export",
      actorType: PdAccessActorType.ADMIN,
      actorUserId: auth.user.id,
      entityType: "AdminEvent",
      rowCount: items.length,
      filterFingerprint: buildFilterFingerprint({ days: true }, { limit: days }),
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
    return fail(T.exportFailed, 500, "ADMIN_EVENTS_FAILED");
  }
}
