import { z } from "zod";
import { NextRequest } from "next/server";
import { requireAdminAuth } from "@/lib/auth/admin";
import { fail, ok } from "@/lib/api/response";
import { logError } from "@/lib/logging/logger";
import { UI_TEXT } from "@/lib/ui/text";
import { getAdminEvents } from "@/features/admin-cabinet/dashboard/server/events.service";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  /** Largest `timeMs` seen by the client — server returns only events
   * newer than this. Omit on first load. */
  since: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  const parsed = querySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return fail("Invalid query", 400, "INVALID_QUERY");
  }

  try {
    const data = await getAdminEvents({
      limit: parsed.data.limit,
      sinceMs: parsed.data.since,
    });
    return ok(data);
  } catch (error) {
    logError("admin.dashboard.events failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return fail(
      UI_TEXT.adminPanel.dashboard.errors.loadEvents,
      500,
      "ADMIN_EVENTS_FAILED",
    );
  }
}
