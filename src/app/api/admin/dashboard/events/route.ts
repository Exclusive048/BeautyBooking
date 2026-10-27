import { z } from "zod";
import { NextRequest } from "next/server";
import { requireAdminAuth } from "@/lib/auth/admin";
import { fail, ok } from "@/lib/api/response";
import { getClientIp } from "@/lib/http/ip";
import { logError } from "@/lib/logging/logger";
import * as UI_TEXT from "@/lib/ui/text";
import { parseAdminEventCategory } from "@/features/admin-cabinet/dashboard/lib/event-categories";
import {
  decodeAdminEventsCursor,
  getAdminEvents,
} from "@/features/admin-cabinet/dashboard/server/events.service";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  /** Опрос: только события не раньше этого момента (unix ms). */
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
    return fail("Некорректные параметры запроса.", 400, "INVALID_QUERY");
  }
  const after = parsed.data.cursor ? decodeAdminEventsCursor(parsed.data.cursor) : null;
  if (parsed.data.cursor && !after) {
    return fail("Некорректные параметры запроса.", 400, "INVALID_QUERY");
  }

  try {
    const data = await getAdminEvents({
      limit: parsed.data.limit,
      sinceMs: parsed.data.since,
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
